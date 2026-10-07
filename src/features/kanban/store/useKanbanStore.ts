import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createIndexedDbStorage } from '../../../lib/indexedDbStorage';
import { DEFAULT_SHEET_COLUMNS } from '../lib/sheetColumns';
import { nextDoneWindow } from '../types';
import type {
  DoneWindow,
  KanbanFilters,
  KanbanGroupBy,
  KanbanViewMode,
  SheetColumnKey,
  SheetGroupBy,
  SheetSort,
} from '../types';

interface KanbanState {
  /** Squad (projeto) do quadro; `null` = a squad da conta conectada. */
  projectKey: string | null;
  /** Quadro escolhido em cada projeto (squad). */
  boardIdByProject: Record<string, number>;
  /** Pessoas cujos cards aparecem, por squad (`ME` = a conta conectada). Sem a chave, só ela; lista vazia não filtra. */
  assigneesByProject: Record<string, string[]>;
  groupBy: KanbanGroupBy;
  /**
   * Até quando as concluídas aparecem (o Jira esconde as antigas). Não é salvo:
   * o quadro começa pela última semana, e o "Carregar mais" amplia.
   */
  doneWindow: DoneWindow;
  /** Quadro (colunas com cards) ou planilha; o resto do estado vale para os dois. */
  viewMode: KanbanViewMode;
  /** Agrupamento das linhas da planilha (o do quadro é `groupBy`). */
  sheetGroupBy: SheetGroupBy;
  sheetSort: SheetSort;
  /** Colunas escolhidas para a planilha (a chave aparece sempre). */
  sheetColumns: SheetColumnKey[];
  /** Larguras das colunas da planilha ajustadas pela pessoa, em px; sem valor, a padrão. */
  sheetColumnWidths: Partial<Record<SheetColumnKey, number>>;
  /** Filtros da lateral: valem para a sessão, não são salvos. */
  filters: KanbanFilters;
  /** Troca a squad do quadro; os filtros (pessoas, tipos, issues pai) são de outra squad e zeram, e as concluídas voltam à última semana. */
  selectProject: (projectKey: string | null) => void;
  /** Outro quadro: as concluídas voltam à última semana. */
  selectBoard: (projectKey: string, boardId: number) => void;
  setAssignees: (projectKey: string, assignees: string[]) => void;
  setGroupBy: (groupBy: KanbanGroupBy) => void;
  /** "Carregar mais": as concluídas de um período maior (até todas). */
  loadMoreDone: () => void;
  setViewMode: (viewMode: KanbanViewMode) => void;
  setSheetGroupBy: (groupBy: SheetGroupBy) => void;
  setSheetSort: (sort: SheetSort) => void;
  setSheetColumns: (columns: SheetColumnKey[]) => void;
  /** `null` volta à largura padrão. */
  setSheetColumnWidth: (column: SheetColumnKey, width: number | null) => void;
  setFilters: (patch: Partial<KanbanFilters>) => void;
  clearFilters: () => void;
}

type PersistedKanban = Pick<
  KanbanState,
  | 'projectKey'
  | 'boardIdByProject'
  | 'assigneesByProject'
  | 'groupBy'
  | 'viewMode'
  | 'sheetGroupBy'
  | 'sheetSort'
  | 'sheetColumns'
  | 'sheetColumnWidths'
>;

export const EMPTY_KANBAN_FILTERS: KanbanFilters = { search: '', issueTypeIds: [], parentKeys: [] };

/** Ordem do quadro (Rank): a ordenação padrão da planilha. */
export const RANK_SORT: SheetSort = { key: 'rank', direction: 'asc' };

export const useKanbanStore = create<KanbanState>()(
  persist(
    (set) => ({
      projectKey: null,
      boardIdByProject: {},
      assigneesByProject: {},
      groupBy: 'parent',
      doneWindow: 'one-week',
      viewMode: 'board',
      sheetGroupBy: 'column',
      sheetSort: RANK_SORT,
      sheetColumns: DEFAULT_SHEET_COLUMNS,
      sheetColumnWidths: {},
      filters: EMPTY_KANBAN_FILTERS,
      selectProject: (projectKey) => set({ projectKey, filters: EMPTY_KANBAN_FILTERS, doneWindow: 'one-week' }),
      setAssignees: (projectKey, assignees) =>
        set((state) => ({ assigneesByProject: { ...state.assigneesByProject, [projectKey]: assignees } })),
      selectBoard: (projectKey, boardId) =>
        set((state) => ({ boardIdByProject: { ...state.boardIdByProject, [projectKey]: boardId }, doneWindow: 'one-week' })),
      setGroupBy: (groupBy) => set({ groupBy }),
      loadMoreDone: () => set((state) => ({ doneWindow: nextDoneWindow(state.doneWindow) ?? state.doneWindow })),
      setViewMode: (viewMode) => set({ viewMode }),
      setSheetGroupBy: (sheetGroupBy) => set({ sheetGroupBy }),
      setSheetSort: (sheetSort) => set({ sheetSort }),
      setSheetColumns: (sheetColumns) => set({ sheetColumns }),
      setSheetColumnWidth: (column, width) =>
        set((state) => {
          const sheetColumnWidths = { ...state.sheetColumnWidths };
          if (width === null) delete sheetColumnWidths[column];
          else sheetColumnWidths[column] = width;
          return { sheetColumnWidths };
        }),
      setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
      clearFilters: () => set({ filters: EMPTY_KANBAN_FILTERS }),
    }),
    {
      name: 'team-report:kanban',
      // v2: o quadro mostra só os cards da pessoa, e o agrupamento por responsável saiu.
      // v3: a janela das concluídas deixou de ser salva (começa sempre pela última semana).
      version: 3,
      migrate: (persisted, version) => {
        const state = { ...(persisted ?? {}) } as Omit<PersistedKanban, 'groupBy'> & { groupBy?: string; doneWindow?: unknown };
        delete state.doneWindow;
        const groupBy = version < 2 && state.groupBy === 'assignee' ? 'parent' : state.groupBy;
        return { ...state, groupBy } as PersistedKanban;
      },
      storage: createIndexedDbStorage<PersistedKanban>(),
      partialize: (state): PersistedKanban => ({
        projectKey: state.projectKey,
        boardIdByProject: state.boardIdByProject,
        assigneesByProject: state.assigneesByProject,
        groupBy: state.groupBy,
        viewMode: state.viewMode,
        sheetGroupBy: state.sheetGroupBy,
        sheetSort: state.sheetSort,
        sheetColumns: state.sheetColumns,
        sheetColumnWidths: state.sheetColumnWidths,
      }),
    },
  ),
);

function subscribeToHydration(onChange: () => void) {
  return useKanbanStore.persist.onFinishHydration(onChange);
}

/** `true` quando o quadro e o agrupamento salvos já foram lidos do IndexedDB. */
export function useKanbanStoreHydrated(): boolean {
  return useSyncExternalStore(subscribeToHydration, () => useKanbanStore.persist.hasHydrated());
}
