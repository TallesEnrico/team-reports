import { requestJira } from '../../../api/jira-client';
import { ISSUE_FIELDS, type JiraIssue, type RawIssueFields, isIssueKey, toJiraIssue } from '../../../api/jira-issues';
import { searchIssues } from '../../../api/jira-search';
import { DONE_WINDOW_DAYS, ME } from '../types';
import type { Board, BoardConfiguration, DoneWindow } from '../types';

// ---------- Formatos crus (Agile 1.0) ----------

interface RawBoard {
  id: number;
  name: string;
  type: string;
  location?: { projectKey?: string };
}

interface BoardPage {
  isLast: boolean;
  values: RawBoard[];
}

interface RawBoardConfiguration {
  id: number;
  name: string;
  filter: { id: string };
  subQuery?: { query?: string };
  columnConfig: { columns: { name: string; statuses: { id: string }[]; min?: number; max?: number }[] };
}

/** Teto de issues por busca (10 páginas): vale para as abertas e, à parte, para as concluídas. */
export const BOARD_ISSUE_LIMIT = 1000;

// ---------- Quadro ----------

/**
 * Quadros com issues do projeto: os criados nele e os de outros projetos cujo
 * filtro inclui a squad (ex: um quadro de epics de várias squads). Exige o
 * escopo `read:board-scope:jira-software`.
 */
export async function fetchBoards(projectKey: string, signal?: AbortSignal): Promise<Board[]> {
  const boards: Board[] = [];
  for (let startAt = 0; ; startAt += 50) {
    const page = await requestJira<BoardPage>('rest/agile/1.0/board', {
      params: { projectKeyOrId: projectKey, startAt, maxResults: 50 },
      signal,
    });
    boards.push(...page.values.map(({ id, name, type, location }) => ({ id, name, type, projectKey: location?.projectKey })));
    if (page.isLast || page.values.length === 0) return boards;
  }
}

interface RawBoardFeatures {
  features?: { boardFeature?: string; featureId?: string; state?: string }[];
}

/** Nomes padrão da coluna de backlog (o Jira cria com o idioma de quem criou o quadro), sem acento. */
const BACKLOG_COLUMN_NAMES = new Set(['backlog', 'lista de pendencias']);

function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
}

/**
 * Backlog do Kanban ligado (configurações do quadro > Colunas > "Kanban
 * backlog"): no Jira, a primeira coluna vira a tela de Backlog e some do
 * quadro. A configuração do quadro não diz isso; vem dos recursos do quadro
 * (`BACKLOG`). Sem essa resposta, vale o nome padrão da coluna de backlog.
 */
async function hasKanbanBacklog(boardId: number, firstColumnName: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const data = await requestJira<RawBoardFeatures>(`rest/agile/1.0/board/${boardId}/features`, { signal });
    const backlog = data.features?.find(
      (feature) => feature.boardFeature === 'BACKLOG' || feature.featureId === 'jsw.agility.backlog',
    );
    if (backlog) return backlog.state === 'ENABLED';
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  return BACKLOG_COLUMN_NAMES.has(normalizeName(firstColumnName));
}

/**
 * Colunas e filtro do quadro, como o Jira mostra no quadro: num Kanban com o
 * backlog ligado, sem a primeira coluna (o backlog). Exige o escopo
 * `read:board-scope.admin:jira-software`.
 */
export async function fetchBoardConfiguration(
  boardId: number,
  boardType: string,
  signal?: AbortSignal,
): Promise<BoardConfiguration> {
  const raw = await requestJira<RawBoardConfiguration>(`rest/agile/1.0/board/${boardId}/configuration`, { signal });
  const columns = raw.columnConfig.columns.map((column, index) => ({
    // A posição na configuração (continua a mesma sem a coluna de backlog).
    id: String(index),
    name: column.name,
    statusIds: column.statuses.map((status) => status.id),
    min: column.min,
    max: column.max,
  }));
  // Só o Kanban tem backlog como coluna (no Scrum o backlog é outra tela, fora das colunas).
  const hidesBacklog =
    boardType === 'kanban' && columns.length > 1 && (await hasKanbanBacklog(boardId, columns[0].name, signal));
  return {
    boardId: raw.id,
    name: raw.name,
    filterId: raw.filter.id,
    subQuery: raw.subQuery?.query?.trim() || undefined,
    // Issues com os status do backlog ficam de fora, como as de status sem coluna.
    columns: hidesBacklog ? columns.slice(1) : columns,
  };
}

export interface BoardIssues {
  issues: JiraIssue[];
  /** A busca parou no limite (`BOARD_ISSUE_LIMIT`). */
  truncated: boolean;
}

/** Filtro de responsável: `ME` vira `currentUser()` (a conta do token). Sem pessoas, não filtra. */
function assigneeClause(assignees: string[]): string | undefined {
  if (assignees.length === 0) return undefined;
  const values = assignees.map((id) => (id === ME ? 'currentUser()' : `"${id.replace(/["\\]/g, '')}"`));
  return values.length === 1 && values[0] === 'currentUser()' ? 'assignee = currentUser()' : `assignee in (${values.join(', ')})`;
}

/**
 * Issues do quadro que passam em `clause` (filtro do quadro e sub-filtro do
 * Kanban), na ordem do quadro (Rank). Com pessoas escolhidas, só as delas; sem
 * ninguém, não filtra por responsável. Busca pela API REST v3 (`read:jira-work`).
 */
async function searchBoardIssues(
  configuration: BoardConfiguration,
  assignees: string[],
  clause: string,
  signal?: AbortSignal,
): Promise<BoardIssues> {
  const subQuery = configuration.subQuery ? ` AND (${configuration.subQuery})` : '';
  const people = assigneeClause(assignees);
  const jql = `filter = ${configuration.filterId}${subQuery}${people ? ` AND ${people}` : ''} AND ${clause} ORDER BY Rank ASC`;
  const result = await searchIssues<RawIssueFields>(jql, ISSUE_FIELDS, { signal, limit: BOARD_ISSUE_LIMIT });
  return { issues: result.issues.map(toJiraIssue), truncated: result.isTruncated };
}

/** Cards abertos do quadro: sempre todos (até o limite), para nenhum card ativo sumir. */
export function fetchOpenBoardIssues(
  configuration: BoardConfiguration,
  assignees: string[],
  signal?: AbortSignal,
): Promise<BoardIssues> {
  return searchBoardIssues(configuration, assignees, 'statusCategory != Done', signal);
}

/**
 * Cards concluídos do quadro: só os da janela (concluídos nos últimos N dias),
 * como o Jira faz ao esconder as concluídas antigas. À parte das abertas: o
 * "Carregar mais" amplia a janela sem buscar as abertas de novo.
 */
export function fetchDoneBoardIssues(
  configuration: BoardConfiguration,
  doneWindow: DoneWindow,
  assignees: string[],
  signal?: AbortSignal,
): Promise<BoardIssues> {
  const days = DONE_WINDOW_DAYS[doneWindow];
  const doneSince = days === null ? '' : ` AND statusCategoryChangedDate >= -${days}d`;
  return searchBoardIssues(configuration, assignees, `statusCategory = Done${doneSince}`, signal);
}

const KEYS_PER_SEARCH = 100;
/**
 * Épico (o pai) de cada história, para o cabeçalho das raias. Só para as
 * histórias que não estão entre os cards carregados (esses já trazem o pai).
 */
export async function fetchStoryEpics(
  storyKeys: string[],
  signal?: AbortSignal,
): Promise<Record<string, { key: string; summary: string }>> {
  const keys = storyKeys.filter(isIssueKey);
  const chunks: string[][] = [];
  for (let start = 0; start < keys.length; start += KEYS_PER_SEARCH) chunks.push(keys.slice(start, start + KEYS_PER_SEARCH));

  const epics: Record<string, { key: string; summary: string }> = {};
  const results = await Promise.all(
    chunks.map((chunk) =>
      searchIssues<{ parent?: { key: string; fields?: { summary?: string } } }>(`key in (${chunk.join(', ')})`, ['parent'], {
        signal,
      }),
    ),
  );
  for (const { issues } of results) {
    for (const issue of issues) {
      const { parent } = issue.fields;
      if (parent) epics[issue.key] = { key: parent.key, summary: parent.fields?.summary ?? parent.key };
    }
  }
  return epics;
}
