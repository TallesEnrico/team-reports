import { jiraBrowseUrl } from '../../../api/jira-client';
import type { ParentRef } from '../../../lib/parentIssue';
import {
  type DateKey,
  eachDay,
  formatDateBR,
  formatDayMonth,
  formatMonthYear,
  formatShortMonth,
  formatWeekdayLong,
  formatWeekdayShort,
  isoWeekNumber,
  isoWeekStart,
  isWeekend,
  toDateKeyInTimeZone,
} from '../../../lib/dates';
import type { GroupBy, PeriodGrouping, ReportIssue, WorklogEntry, WorklogReport } from '../types';

export interface PeriodColumn {
  /** Dia: a data (YYYY-MM-DD); semana: a segunda-feira (YYYY-MM-DD); mês: YYYY-MM. */
  key: string;
  label: string;
  sublabel: string;
  /** Legenda completa para leitores de tela / tooltip. */
  title: string;
  isWeekend: boolean;
  isToday: boolean;
}

/** Faixa acima dos cabeçalhos de período (mês, para colunas diárias; ano, nos demais). */
export interface ColumnBand {
  key: string;
  label: string;
  span: number;
}

/** Um apontamento dentro de uma célula, com quem apontou (tooltip e detalhes). */
export interface CellWorklog extends WorklogEntry {
  author: string;
  avatarUrl?: string;
}

export interface ReportRow {
  id: string;
  kind: 'issue' | 'group';
  /** Issue com status na categoria "Em andamento" (qualquer nome de status). */
  inProgress?: boolean;
  label: string;
  secondary?: string;
  /** Página da issue no Jira (exportações; na tela, a chave abre o modal da issue). */
  href?: string;
  iconUrl?: string;
  avatarUrl?: string;
  issue?: ReportIssue;
  /** Agrupado por issue pai: a pai do grupo (a chave abre o modal dela). */
  parentIssue?: ParentRef;
  cells: Record<string, number>;
  /** Apontamentos de cada célula, em ordem cronológica (só nas linhas de issue). */
  worklogs?: Record<string, CellWorklog[]>;
  total: number;
  children?: ReportRow[];
}

export interface ReportTable {
  columns: PeriodColumn[];
  bands: ColumnBand[];
  rows: ReportRow[];
  columnTotals: Record<string, number>;
  grandTotal: number;
  issueCount: number;
  authorCount: number;
}

export interface BuildReportTableOptions {
  from: DateKey;
  to: DateKey;
  groupBy: GroupBy;
  period: PeriodGrouping;
  timeZone: string;
  today: DateKey;
}

// ---------- Colunas ----------

function periodKeyOf(day: DateKey, period: PeriodGrouping): string {
  if (period === 'week') return isoWeekStart(day);
  if (period === 'month') return day.slice(0, 7);
  return day;
}

interface ColumnRange {
  key: string;
  firstDay: DateKey;
  lastDay: DateKey;
  isToday: boolean;
}

function buildColumns(days: DateKey[], period: PeriodGrouping, today: DateKey): PeriodColumn[] {
  const ranges = new Map<string, ColumnRange>();
  for (const day of days) {
    const key = periodKeyOf(day, period);
    const range = ranges.get(key);
    if (range) {
      range.lastDay = day;
      range.isToday ||= day === today;
    } else {
      ranges.set(key, { key, firstDay: day, lastDay: day, isToday: day === today });
    }
  }

  return [...ranges.values()].map(({ key, firstDay, lastDay, isToday }) => {
    const base = { key, isToday, isWeekend: period === 'day' && isWeekend(firstDay) };

    if (period === 'day') {
      const title = `${formatDateBR(firstDay)} (${formatWeekdayLong(firstDay)})`;
      return { ...base, label: firstDay.slice(8, 10), sublabel: formatWeekdayShort(firstDay), title };
    }
    if (period === 'week') {
      // Semanas nas pontas do período mostram só os dias que caem dentro dele.
      const week = isoWeekNumber(firstDay);
      const sublabel = `${formatDayMonth(firstDay)}–${formatDayMonth(lastDay)}`;
      return { ...base, label: `S${week}`, sublabel, title: `Semana ${week}: ${sublabel}` };
    }
    return { ...base, label: formatShortMonth(firstDay), sublabel: firstDay.slice(0, 4), title: formatMonthYear(firstDay) };
  });
}

function buildBands(columns: PeriodColumn[], period: PeriodGrouping): ColumnBand[] {
  const bands: ColumnBand[] = [];
  for (const column of columns) {
    // Colunas semanais são chaveadas pela segunda-feira: a semana entra no ano em que começa.
    const bandKey = period === 'day' ? column.key.slice(0, 7) : column.key.slice(0, 4);
    const last = bands.at(-1);
    if (last?.key === bandKey) {
      last.span += 1;
    } else {
      bands.push({ key: bandKey, label: period === 'day' ? formatMonthYear(`${bandKey}-01`) : bandKey, span: 1 });
    }
  }
  return bands;
}

// ---------- Linhas ----------

const issueKeyCollator = new Intl.Collator('pt-BR', { numeric: true });

function compareIssueKeys(a: string, b: string): number {
  return issueKeyCollator.compare(a, b);
}

function createIssueRow(issue: ReportIssue, idPrefix = ''): ReportRow {
  return {
    id: `${idPrefix}issue:${issue.id}`,
    kind: 'issue',
    label: issue.key,
    secondary: issue.summary,
    href: jiraBrowseUrl(issue.key),
    // Públicos no site do Jira: o <img> carrega direto, sem autenticação.
    iconUrl: issue.issueType?.iconUrl,
    inProgress: issue.status?.categoryKey === 'indeterminate',
    issue,
    cells: {},
    worklogs: {},
    total: 0,
  };
}

interface GroupDescriptor {
  key: string;
  label: string;
  secondary?: string;
  href?: string;
  parentIssue?: ParentRef;
  avatarUrl?: string;
  sortKey: string;
}

const NO_PARENT_KEY = '￿';

function describeGroup(
  groupBy: Exclude<GroupBy, 'issue'>,
  issue: ReportIssue,
  authorId: string,
  report: WorklogReport,
): GroupDescriptor {
  if (groupBy === 'user') {
    const author = report.authors[authorId] ?? (issue.assignee?.accountId === authorId ? issue.assignee : undefined);
    const name = author?.displayName ?? (authorId ? 'Usuário desconhecido' : 'Sem responsável');
    return { key: authorId || 'unassigned', label: name, avatarUrl: author?.avatarUrl, sortKey: name };
  }
  if (groupBy === 'project') {
    return { key: issue.projectKey, label: issue.projectKey, secondary: issue.projectName, sortKey: issue.projectKey };
  }
  if (!issue.parent) {
    return { key: NO_PARENT_KEY, label: 'Sem issue pai', sortKey: NO_PARENT_KEY };
  }
  return {
    key: issue.parent.key,
    label: issue.parent.key,
    secondary: issue.parent.summary,
    href: jiraBrowseUrl(issue.parent.key),
    parentIssue: issue.parent,
    sortKey: issue.parent.key,
  };
}

function addToRow(row: ReportRow, columnKey: string, seconds: number, worklog?: CellWorklog) {
  row.cells[columnKey] = (row.cells[columnKey] ?? 0) + seconds;
  row.total += seconds;
  if (row.worklogs && worklog) (row.worklogs[columnKey] ??= []).push(worklog);
}

function sortIssueRows(rows: Iterable<ReportRow>): ReportRow[] {
  return [...rows].sort((a, b) => {
    if (Boolean(a.inProgress) !== Boolean(b.inProgress)) return a.inProgress ? -1 : 1;
    return compareIssueKeys(a.label, b.label);
  });
}

/** Linha (de qualquer nível) pelo id. */
export function findRow(rows: ReportRow[], id: string): ReportRow | undefined {
  for (const row of rows) {
    if (row.id === id) return row;
    const child = row.children?.find((candidate) => candidate.id === id);
    if (child) return child;
  }
  return undefined;
}

// ---------- Montagem ----------

export function buildReportTable(report: WorklogReport, options: BuildReportTableOptions): ReportTable {
  const { from, to, groupBy, period, timeZone, today } = options;
  const columns = buildColumns(eachDay(from, to), period, today);
  const issuesById = new Map(report.issues.map((issue) => [issue.id, issue]));

  const columnTotals: Record<string, number> = {};
  let grandTotal = 0;
  const issueIds = new Set<string>();
  const authorIds = new Set<string>();

  const issueRows = new Map<string, ReportRow>();
  const groups = new Map<string, { row: ReportRow; sortKey: string; children: Map<string, ReportRow> }>();

  // Em ordem cronológica, para os apontamentos de cada célula saírem em sequência no tooltip.
  const worklogs = report.worklogs
    .map((worklog) => ({ worklog, startedAt: Date.parse(worklog.started) }))
    .sort((a, b) => a.startedAt - b.startedAt);

  for (const { worklog } of worklogs) {
    const day = toDateKeyInTimeZone(worklog.started, timeZone);
    if (day < from || day > to) continue;

    const issue = issuesById.get(worklog.issueId);
    if (!issue) continue;

    const columnKey = periodKeyOf(day, period);
    const author = report.authors[worklog.authorId];
    const cellWorklog: CellWorklog = {
      ...worklog,
      author: author?.displayName ?? 'Usuário desconhecido',
      avatarUrl: author?.avatarUrl,
    };

    columnTotals[columnKey] = (columnTotals[columnKey] ?? 0) + worklog.seconds;
    grandTotal += worklog.seconds;
    issueIds.add(issue.id);
    authorIds.add(worklog.authorId);

    if (groupBy === 'issue') {
      let row = issueRows.get(issue.id);
      if (!row) issueRows.set(issue.id, (row = createIssueRow(issue)));
      addToRow(row, columnKey, worklog.seconds, cellWorklog);
      continue;
    }

    const descriptor = describeGroup(groupBy, issue, worklog.authorId, report);
    let group = groups.get(descriptor.key);
    if (!group) {
      group = {
        sortKey: descriptor.sortKey,
        children: new Map(),
        row: {
          id: `${groupBy}:${descriptor.key}`,
          kind: 'group',
          label: descriptor.label,
          secondary: descriptor.secondary,
          href: descriptor.href,
          parentIssue: descriptor.parentIssue,
          avatarUrl: descriptor.avatarUrl,
          cells: {},
          total: 0,
        },
      };
      groups.set(descriptor.key, group);
    }
    addToRow(group.row, columnKey, worklog.seconds);

    let child = group.children.get(issue.id);
    if (!child) group.children.set(issue.id, (child = createIssueRow(issue, `${group.row.id}/`)));
    addToRow(child, columnKey, worklog.seconds, cellWorklog);
  }

  for (const issue of report.issues) {
    if (issue.status?.categoryKey !== 'indeterminate') continue;
    if (groupBy === 'issue') {
      if (issueRows.has(issue.id)) continue;
      issueRows.set(issue.id, createIssueRow(issue));
      issueIds.add(issue.id);
      continue;
    }
    if ([...groups.values()].some((group) => group.children.has(issue.id))) continue;

    const descriptor = describeGroup(groupBy, issue, issue.assignee?.accountId ?? '', report);
    let group = groups.get(descriptor.key);
    if (!group) {
      group = {
        sortKey: descriptor.sortKey,
        children: new Map(),
        row: {
          id: `${groupBy}:${descriptor.key}`,
          kind: 'group',
          label: descriptor.label,
          secondary: descriptor.secondary,
          href: descriptor.href,
          parentIssue: descriptor.parentIssue,
          avatarUrl: descriptor.avatarUrl,
          cells: {},
          total: 0,
        },
      };
      groups.set(descriptor.key, group);
    }
    group.children.set(issue.id, createIssueRow(issue, `${group.row.id}/`));
    issueIds.add(issue.id);
  }

  let rows: ReportRow[];
  if (groupBy === 'issue') {
    rows = sortIssueRows(issueRows.values());
  } else {
    const compareGroups =
      groupBy === 'user'
        ? (a: string, b: string) => a.localeCompare(b, 'pt-BR')
        : compareIssueKeys;
    rows = [...groups.values()]
      .sort((a, b) => {
        const aInProgress = [...a.children.values()].some((child) => child.inProgress);
        const bInProgress = [...b.children.values()].some((child) => child.inProgress);
        if (aInProgress !== bInProgress) return aInProgress ? -1 : 1;
        return compareGroups(a.sortKey, b.sortKey);
      })
      .map((group) => ({ ...group.row, children: sortIssueRows(group.children.values()) }));
  }

  return {
    columns,
    bands: buildBands(columns, period),
    rows,
    columnTotals,
    grandTotal,
    issueCount: issueIds.size,
    authorCount: authorIds.size,
  };
}
