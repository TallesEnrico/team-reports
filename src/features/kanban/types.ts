// Issues (cards, status, transições) são compartilhadas com as outras telas (src/api).
export type { IssueStatus, IssueTransition, JiraIssue } from '../../api/jira-issues';

export interface Board {
  id: number;
  name: string;
  /** 'kanban' ou 'scrum'. */
  type: string;
  /** Projeto onde o quadro foi criado (pode ser outro: o filtro só inclui issues da squad). */
  projectKey?: string;
}

export interface BoardColumn {
  /** Posição da coluna no quadro (o nome pode se repetir). */
  id: string;
  name: string;
  statusIds: string[];
  /** Limites de WIP configurados no quadro. */
  min?: number;
  max?: number;
}

export interface BoardConfiguration {
  boardId: number;
  name: string;
  columns: BoardColumn[];
  /** Filtro salvo que define as issues do quadro. */
  filterId: string;
  /** Sub-filtro do Kanban (ex: esconder concluídas antigas). */
  subQuery?: string;
}

/** `story`: uma raia por história (ou tarefa, bug), com as subtarefas dela nas colunas. */
export type KanbanGroupBy = 'none' | 'parent' | 'story';

/** Nas pessoas escolhidas, a conta conectada (vira `currentUser()` no JQL). */
export const ME = 'me';

/**
 * Até quando as concluídas aparecem no quadro. O Jira esconde as concluídas
 * antigas, mas a API não informa o prazo de cada quadro: o quadro começa pela
 * última semana e o "Carregar mais" avança um passo (2 semanas, 4, todas).
 */
export const DONE_WINDOWS = ['one-week', 'two-weeks', 'four-weeks', 'all'] as const;

export type DoneWindow = (typeof DONE_WINDOWS)[number];

export const DONE_WINDOW_DAYS: Record<DoneWindow, number | null> = {
  'one-week': 7,
  'two-weeks': 14,
  'four-weeks': 28,
  all: null,
};

/** Próximo passo do "Carregar mais"; `null` com todas já na tela. */
export function nextDoneWindow(doneWindow: DoneWindow): DoneWindow | null {
  return DONE_WINDOWS[DONE_WINDOWS.indexOf(doneWindow) + 1] ?? null;
}

export interface KanbanFilters {
  search: string;
  issueTypeIds: string[];
  parentKeys: string[];
}

// ---------- Visualização em planilha ----------

/** Como o quadro aparece: colunas com cards (`board`) ou em planilha (`sheet`). */
export type KanbanViewMode = 'board' | 'sheet';

/** Na planilha, `column`: um grupo por coluna do quadro, na ordem do quadro (como as colunas do quadro). */
export type SheetGroupBy = 'column' | 'parent' | 'none';

/** Colunas da planilha. */
export type SheetColumnKey =
  | 'key'
  | 'summary'
  | 'status'
  | 'assignee'
  | 'priority'
  | 'parent'
  | 'estimate'
  | 'spent'
  | 'remaining';

/** `rank`: a ordem do quadro (Rank), a padrão. */
export type SheetSortKey = 'rank' | SheetColumnKey;

export interface SheetSort {
  key: SheetSortKey;
  direction: 'asc' | 'desc';
}
