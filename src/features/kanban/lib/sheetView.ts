import type { ParentRef } from '../../../lib/parentIssue';
import type { BoardColumn, JiraIssue, KanbanFilters, SheetGroupBy, SheetSort, SheetSortKey } from '../types';
import { type ColumnMetrics, columnIdByStatus, columnMetrics, createIssueFilter } from './boardView';

export type SheetGroupHeader =
  /** Coluna do quadro; `total`: as issues dela sem os filtros da lateral (para "N de M" e o limite de WIP). */
  | { kind: 'column'; column: BoardColumn; total: number }
  | { kind: 'parent'; parent: ParentRef }
  /** Issues sem issue pai, no agrupamento por issue pai. */
  | { kind: 'loose' };

export interface SheetGroup {
  key: string;
  /** Sem cabeçalho: agrupamento "Nenhum". */
  header?: SheetGroupHeader;
  /** As que passam nos filtros, já ordenadas. */
  issues: JiraIssue[];
  metrics: ColumnMetrics;
}

export interface SheetView {
  groups: SheetGroup[];
  /** Issues que passam nos filtros. */
  shown: number;
  /** Issues no quadro (status dentro das colunas), sem os filtros. */
  total: number;
  metrics: ColumnMetrics;
}

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

type SortValue = string | number | undefined;

function priorityOrder(issue: JiraIssue): SortValue {
  if (!issue.priority) return undefined;
  // No esquema padrão do Jira, o id cresce da mais alta (1) para a mais baixa (5).
  const id = Number(issue.priority.id);
  return Number.isFinite(id) ? id : issue.priority.name;
}

function sortValue(issue: JiraIssue, key: SheetSortKey, rank: Map<string, number>, columnIndex: Map<string, number>): SortValue {
  switch (key) {
    case 'rank':
      return rank.get(issue.id);
    case 'key':
      return issue.key;
    case 'summary':
      return issue.summary;
    case 'status':
      // Na ordem das colunas do quadro.
      return columnIndex.get(issue.status.id);
    case 'assignee':
      return issue.assignee?.displayName;
    case 'priority':
      return priorityOrder(issue);
    case 'parent':
      return issue.parent?.key;
    case 'estimate':
      return issue.originalEstimateSeconds;
    case 'spent':
      return issue.timeSpentSeconds;
    case 'remaining':
      return issue.remainingEstimateSeconds;
  }
}

/** Ordena pela coluna escolhida; vazios por último nos dois sentidos, e empates na ordem do quadro. */
function sortIssues(issues: JiraIssue[], sort: SheetSort, rank: Map<string, number>, columnIndex: Map<string, number>): JiraIssue[] {
  const direction = sort.direction === 'asc' ? 1 : -1;
  const values = new Map(issues.map((issue) => [issue.id, sortValue(issue, sort.key, rank, columnIndex)]));
  return [...issues].sort((a, b) => {
    const left = values.get(a.id);
    const right = values.get(b.id);
    if (left !== right) {
      if (left === undefined) return 1;
      if (right === undefined) return -1;
      const compared =
        typeof left === 'number' && typeof right === 'number' ? left - right : collator.compare(String(left), String(right));
      if (compared !== 0) return compared * direction;
    }
    return rank.get(a.id)! - rank.get(b.id)!;
  });
}

/** Grupos por issue pai na ordem do quadro (onde aparece a primeira issue de cada um); sem pai, por último. */
function groupByParent(issues: JiraIssue[], rankOrder: JiraIssue[]): SheetGroup[] {
  const order = new Map<string, number>();
  for (const issue of rankOrder) if (issue.parent && !order.has(issue.parent.key)) order.set(issue.parent.key, order.size);

  const groups = new Map<string, SheetGroup>();
  const loose: JiraIssue[] = [];
  for (const issue of issues) {
    const { parent } = issue;
    if (!parent) {
      loose.push(issue);
      continue;
    }
    let group = groups.get(parent.key);
    if (!group) groups.set(parent.key, (group = { key: parent.key, header: { kind: 'parent', parent }, issues: [], metrics: columnMetrics([]) }));
    group.issues.push(issue);
  }

  const result = [...groups.values()].sort((a, b) => order.get(a.key)! - order.get(b.key)!);
  if (loose.length > 0) result.push({ key: 'loose', header: { kind: 'loose' }, issues: loose, metrics: columnMetrics([]) });
  return result.map((group) => ({ ...group, metrics: columnMetrics(group.issues) }));
}

/**
 * Linhas da planilha: as issues do quadro (status dentro das colunas, como no
 * Kanban) que passam nos filtros da lateral, ordenadas e agrupadas. Por coluna,
 * todas as colunas aparecem, mesmo vazias, como no quadro.
 */
export function buildSheetView(
  columns: BoardColumn[],
  issues: JiraIssue[],
  filters: KanbanFilters,
  groupBy: SheetGroupBy,
  sort: SheetSort,
): SheetView {
  const columnOf = columnIdByStatus(columns);
  const columnIndex = new Map<string, number>();
  columns.forEach((column, index) => column.statusIds.forEach((statusId) => columnIndex.set(statusId, index)));

  const onBoard = issues.filter((issue) => columnOf.has(issue.status.id));
  const rank = new Map(onBoard.map((issue, index) => [issue.id, index]));
  const matches = createIssueFilter(filters);
  const shown = sortIssues(onBoard.filter(matches), sort, rank, columnIndex);

  let groups: SheetGroup[];
  if (groupBy === 'column') {
    groups = columns.map((column) => {
      const inColumn = shown.filter((issue) => columnOf.get(issue.status.id) === column.id);
      return {
        key: column.id,
        header: { kind: 'column', column, total: onBoard.filter((issue) => columnOf.get(issue.status.id) === column.id).length },
        issues: inColumn,
        metrics: columnMetrics(inColumn),
      };
    });
  } else if (groupBy === 'parent') {
    groups = groupByParent(shown, onBoard);
  } else {
    groups = [{ key: 'all', issues: shown, metrics: columnMetrics(shown) }];
  }

  return { groups, shown: shown.length, total: onBoard.length, metrics: columnMetrics(shown) };
}
