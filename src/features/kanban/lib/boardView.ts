import { jiraBrowseUrl } from '../../../api/jira-client';
import { overEstimateSeconds } from '../../../api/jira-issues';
import type { ParentRef } from '../../../lib/parentIssue';
import type { BoardColumn, KanbanFilters, KanbanGroupBy, JiraIssue } from '../types';

export interface CardGroup {
  key: string;
  /** Sem cabeçalho: cards soltos (sem issue pai ou sem agrupamento). */
  header?: {
    title: string;
    subtitle?: string;
    href?: string;
    iconUrl?: string;
    /** Issue pai do grupo: o cabeçalho abre o modal dela. */
    parent?: ParentRef;
  };
  issues: JiraIssue[];
}

/** Tempos somados dos cards da coluna (os que passam nos filtros). */
export interface ColumnMetrics {
  /** Estimativas originais. */
  estimatedSeconds: number;
  /** Tempo lançado. */
  spentSeconds: number;
  /** Estimativa restante (dos cards que têm uma). */
  remainingSeconds: number;
  withoutEstimate: number;
  /** Cards com mais tempo lançado que o estimado. */
  overEstimate: number;
}

export interface ColumnView {
  column: BoardColumn;
  /** Cards da coluna sem filtro. */
  total: number;
  /** Cards que passam nos filtros. */
  shown: number;
  metrics: ColumnMetrics;
  groups: CardGroup[];
}

export function columnMetrics(issues: JiraIssue[]): ColumnMetrics {
  const metrics: ColumnMetrics = { estimatedSeconds: 0, spentSeconds: 0, remainingSeconds: 0, withoutEstimate: 0, overEstimate: 0 };
  for (const issue of issues) {
    const estimate = issue.originalEstimateSeconds ?? 0;
    metrics.estimatedSeconds += estimate;
    metrics.spentSeconds += issue.timeSpentSeconds;
    metrics.remainingSeconds += issue.remainingEstimateSeconds ?? 0;
    if (!estimate) metrics.withoutEstimate += 1;
    else if (overEstimateSeconds(issue) > 0) metrics.overEstimate += 1;
  }
  return metrics;
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function hasActiveFilters(filters: KanbanFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.issueTypeIds.length > 0 ||
    filters.parentKeys.length > 0
  );
}

/** Predicado dos filtros da lateral (pesquisa por chave ou resumo, tipo, issue pai). */
export function createIssueFilter(filters: KanbanFilters): (issue: JiraIssue) => boolean {
  const search = normalize(filters.search.trim());
  const types = new Set(filters.issueTypeIds);
  const parents = new Set(filters.parentKeys);

  return (issue) => {
    if (search && !normalize(`${issue.key} ${issue.summary}`).includes(search)) return false;
    if (types.size > 0 && !types.has(issue.issueType.id)) return false;
    if (parents.size > 0 && !(issue.parent && parents.has(issue.parent.key))) return false;
    return true;
  };
}

/** Coluna de cada status; issues com status fora das colunas não aparecem no quadro (como no Jira). */
export function columnIdByStatus(columns: BoardColumn[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const column of columns) {
    for (const statusId of column.statusIds) map.set(statusId, column.id);
  }
  return map;
}

/**
 * Colunas das concluídas, onde fica o "Carregar mais": as que têm cards de
 * status concluído (sem os filtros da lateral); sem nenhum, a última, que no Jira é a de concluídas.
 */
export function doneColumnIds(columns: BoardColumn[], issues: JiraIssue[]): Set<string> {
  const columnOf = columnIdByStatus(columns);
  const ids = new Set<string>();
  for (const issue of issues) {
    const columnId = issue.status.categoryKey === 'done' ? columnOf.get(issue.status.id) : undefined;
    if (columnId) ids.add(columnId);
  }
  if (ids.size === 0 && columns.length > 0) ids.add(columns[columns.length - 1].id);
  return ids;
}

/** Cabeçalho de grupo para uma issue (o pai de um card, ou a própria história). */
function headerFor(issue: { key: string; summary: string; iconUrl?: string }): NonNullable<CardGroup['header']> {
  return { title: issue.key, subtitle: issue.summary, href: jiraBrowseUrl(issue.key), iconUrl: issue.iconUrl };
}

/** Por issue pai: cada card no grupo do pai imediato (subtarefa → história; história → épico). */
function groupByParent(issues: JiraIssue[]): CardGroup[] {
  // Na ordem do quadro (Rank): o grupo entra onde aparece o primeiro card dele.
  const groups = new Map<string, CardGroup>();
  const loose: JiraIssue[] = [];
  for (const issue of issues) {
    const { parent } = issue;
    if (!parent) {
      loose.push(issue);
      continue;
    }
    let group = groups.get(parent.key);
    if (!group) groups.set(parent.key, (group = { key: parent.key, header: { ...headerFor(parent), parent }, issues: [] }));
    group.issues.push(issue);
  }

  const result = [...groups.values()];
  if (loose.length > 0) result.push({ key: 'loose', issues: loose });
  return result;
}

// Por história o quadro vira raias (lib/swimlanes.ts); aqui a coluna fica sem grupos.
function groupIssues(issues: JiraIssue[], groupBy: KanbanGroupBy): CardGroup[] {
  if (groupBy === 'parent') return groupByParent(issues);
  return issues.length > 0 ? [{ key: 'all', issues }] : [];
}

export function buildBoardView(
  columns: BoardColumn[],
  issues: JiraIssue[],
  filters: KanbanFilters,
  groupBy: KanbanGroupBy,
): ColumnView[] {
  const columnOf = columnIdByStatus(columns);
  const matches = createIssueFilter(filters);
  const byColumn = new Map<string, JiraIssue[]>(columns.map((column) => [column.id, []]));
  for (const issue of issues) {
    const columnId = columnOf.get(issue.status.id);
    if (columnId) byColumn.get(columnId)!.push(issue);
  }

  return columns.map((column) => {
    const all = byColumn.get(column.id)!;
    const shown = all.filter(matches);
    return {
      column,
      total: all.length,
      shown: shown.length,
      metrics: columnMetrics(shown),
      groups: groupIssues(shown, groupBy),
    };
  });
}

// ---------- Opções dos filtros ----------

export interface FilterOption {
  id: string;
  label: string;
  /** Texto auxiliar (ex: resumo da issue pai). */
  detail?: string;
  iconUrl?: string;
  count: number;
}

export interface FilterOptions {
  issueTypes: FilterOption[];
  parents: FilterOption[];
}

function upsert(map: Map<string, FilterOption>, option: Omit<FilterOption, 'count'>) {
  const existing = map.get(option.id);
  if (existing) existing.count += 1;
  else map.set(option.id, { ...option, count: 1 });
}

const collator = new Intl.Collator('pt-BR', { numeric: true });

/** Tipos e issues pai presentes nos cards do quadro. */
export function collectFilterOptions(columns: BoardColumn[], issues: JiraIssue[]): FilterOptions {
  const columnOf = columnIdByStatus(columns);
  const issueTypes = new Map<string, FilterOption>();
  const parents = new Map<string, FilterOption>();

  for (const issue of issues) {
    if (!columnOf.has(issue.status.id)) continue;
    if (issue.issueType.id) {
      upsert(issueTypes, { id: issue.issueType.id, label: issue.issueType.name, iconUrl: issue.issueType.iconUrl });
    }
    if (issue.parent) {
      upsert(parents, {
        id: issue.parent.key,
        label: issue.parent.key,
        detail: issue.parent.summary,
        iconUrl: issue.parent.iconUrl,
      });
    }
  }

  const byLabel = (a: FilterOption, b: FilterOption) => collator.compare(a.label, b.label);
  return {
    issueTypes: [...issueTypes.values()].sort(byLabel),
    parents: [...parents.values()].sort(byLabel),
  };
}
