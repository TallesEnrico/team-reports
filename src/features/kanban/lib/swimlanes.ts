import { jiraBrowseUrl } from '../../../api/jira-client';
import type { BoardColumn, IssueStatus, KanbanFilters, JiraIssue } from '../types';
import { type ColumnView, columnIdByStatus, columnMetrics, createIssueFilter } from './boardView';

/** Raia dos cards que não são subtarefa de uma história (fica por último). */
export const OTHERS_LANE = 'others';

export interface SwimlaneStory {
  id: string;
  key: string;
  summary: string;
  href: string;
  iconUrl?: string;
  status?: IssueStatus;
  epic?: { key: string; summary: string };
}

export interface Swimlane {
  /** Chave da história, ou `OTHERS_LANE`. */
  key: string;
  /** Ausente na raia "Outras issues". */
  story?: SwimlaneStory;
  /** Cards da raia (com os filtros). */
  cardCount: number;
  columns: ColumnView[];
}

export type EpicsByStory = Record<string, { key: string; summary: string }>;

function isSubtask(issue: JiraIssue): boolean {
  return issue.issueType.hierarchyLevel < 0 && issue.parent !== undefined;
}

/** Histórias (chaves) das subtarefas carregadas que não estão entre os cards: o épico delas vem de outra busca. */
export function storiesMissingEpic(issues: JiraIssue[]): string[] {
  const loaded = new Set(issues.map((issue) => issue.key));
  const keys = new Set<string>();
  for (const issue of issues) {
    if (isSubtask(issue) && !loaded.has(issue.parent!.key)) keys.add(issue.parent!.key);
  }
  return [...keys];
}

/**
 * Agrupamento por história, como no Jira: uma raia por história (ou tarefa,
 * bug) com subtarefas no quadro, com as colunas do quadro e as subtarefas
 * dela. A história em si vira o cabeçalho da raia (não aparece como card); o
 * resto vai para "Outras issues", no fim. Raias e cards na ordem do quadro (Rank).
 */
export function buildSwimlanes(
  columns: BoardColumn[],
  issues: JiraIssue[],
  filters: KanbanFilters,
  epicsByStory: EpicsByStory,
): Swimlane[] {
  const columnOf = columnIdByStatus(columns);
  const matches = createIssueFilter(filters);
  const byKey = new Map(issues.map((issue) => [issue.key, issue]));
  const shown = issues.filter((issue) => columnOf.has(issue.status.id) && matches(issue));
  const storyKeys = new Set(shown.filter(isSubtask).map((issue) => issue.parent!.key));

  const cardsByLane = new Map<string, JiraIssue[]>();
  for (const issue of shown) {
    if (storyKeys.has(issue.key)) continue;
    const laneKey = isSubtask(issue) ? issue.parent!.key : OTHERS_LANE;
    const cards = cardsByLane.get(laneKey);
    if (cards) cards.push(issue);
    else cardsByLane.set(laneKey, [issue]);
  }

  const laneKeys = [...cardsByLane.keys()].filter((key) => key !== OTHERS_LANE);
  if (cardsByLane.has(OTHERS_LANE)) laneKeys.push(OTHERS_LANE);

  return laneKeys.map((laneKey) => {
    const cards = cardsByLane.get(laneKey)!;
    return {
      key: laneKey,
      story: laneKey === OTHERS_LANE ? undefined : describeStory(laneKey, byKey.get(laneKey), cards[0], epicsByStory),
      cardCount: cards.length,
      columns: columns.map((column) => {
        const inColumn = cards.filter((issue) => columnOf.get(issue.status.id) === column.id);
        return {
          column,
          total: inColumn.length,
          shown: inColumn.length,
          metrics: columnMetrics(inColumn),
          groups: inColumn.length > 0 ? [{ key: 'all', issues: inColumn }] : [],
        };
      }),
    };
  });
}

/** Dados da história: do card dela, se é um dos cards carregados; senão, do pai da subtarefa. */
function describeStory(
  key: string,
  storyCard: JiraIssue | undefined,
  firstSubtask: JiraIssue,
  epicsByStory: EpicsByStory,
): SwimlaneStory {
  if (storyCard) {
    return {
      id: storyCard.id,
      key,
      summary: storyCard.summary,
      href: jiraBrowseUrl(key),
      iconUrl: storyCard.issueType.iconUrl,
      status: storyCard.status,
      epic: storyCard.parent ? { key: storyCard.parent.key, summary: storyCard.parent.summary } : undefined,
    };
  }
  const parent = firstSubtask.parent!;
  return {
    id: parent.id,
    key,
    summary: parent.summary,
    href: jiraBrowseUrl(key),
    iconUrl: parent.iconUrl,
    status: parent.status,
    epic: epicsByStory[key],
  };
}
