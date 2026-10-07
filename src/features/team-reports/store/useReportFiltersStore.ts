import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isoWeekRange, todayKey } from '../../../lib/dates';
import { createIndexedDbStorage } from '../../../lib/indexedDbStorage';
import { defaultReportTimeZone, isReportTimeZone } from '../../../lib/timeZones';
import { clearShareSearch, parseShareSearch, readShareSearch, type SharedReport } from '../lib/shareLink';
import { validateFilters } from '../lib/validateFilters';
import type { ReportDisplay, ReportFilters } from '../types';

interface ReportFiltersState {
  /** Valores do painel de filtros. */
  draft: ReportFilters;
  /**
   * Filtros do relatório na tela. `null` até a página do relatório abrir (ela
   * gera sozinha com os filtros salvos, se forem válidos; ver TeamReportPage),
   * até o primeiro "Gerar relatório" ou até abrir um link compartilhado; a
   * partir daí o painel é aplicado automaticamente (useAutoApplyFilters).
   * Fica só em memória: volta a `null` a cada recarga da página.
   */
  applied: ReportFilters | null;
  display: ReportDisplay;
  setDraft: (patch: Partial<ReportFilters>) => void;
  /** Aplica o painel ao relatório; na primeira vez, liga a atualização automática. */
  applyDraft: () => void;
  setDisplay: (patch: Partial<ReportDisplay>) => void;
  applyShared: (shared: SharedReport) => void;
}

let pendingShared: SharedReport | null = null;

/** O que vai para o IndexedDB: tudo o que o usuário escolheu na tela. */
type PersistedFilters = Pick<ReportFiltersState, 'draft' | 'display'>;

const defaultFilters: ReportFilters = {
  // Sem valor salvo, o período padrão é "Esta semana".
  ...isoWeekRange(todayKey()),
  // Preenchido com a squad escolhida ao conectar a conta (App.tsx).
  projectKeys: [],
  principals: [{ type: 'current-user' }],
  additionalFieldIds: [],
  jql: '',
};

const defaultDisplay: ReportDisplay = {
  groupBy: 'issue',
  period: 'day',
  timeFormat: 'hours-minutes',
  timeZone: defaultReportTimeZone(),
};

// Cada mudança no painel ou na configuração do topo é gravada no IndexedDB,
// então a tela reabre com os últimos valores escolhidos (inclusive as datas).
export const useReportFiltersStore = create<ReportFiltersState>()(
  persist(
    (set) => ({
      draft: defaultFilters,
      applied: null,
      display: defaultDisplay,
      setDraft: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
      applyDraft: () => set((state) => ({ applied: state.draft })),
      setDisplay: (patch) => set((state) => ({ display: { ...state.display, ...patch } })),
      applyShared: (shared) => {
        if (!useReportFiltersStore.persist.hasHydrated()) pendingShared = shared;
        set((state) => {
          const draft = { ...state.draft, ...shared.filters };
          const display = { ...state.display, ...shared.display };
          return { draft, display, applied: validateFilters(draft) === null ? draft : state.applied };
        });
      },
    }),
    {
      name: 'team-report:filters',
      version: 2,
      storage: createIndexedDbStorage<PersistedFilters>(),
      partialize: (state): PersistedFilters => ({ draft: state.draft, display: state.display }),
      // Ordem: padrões ← salvo no IndexedDB ← link compartilhado (?from=…), que vence.
      // Fuso salvo fora de FIXED_TIME_ZONES (ex: 'user'/'browser' de versões antigas) volta ao padrão.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PersistedFilters>;
        const shared = pendingShared ?? parseShareSearch(readShareSearch());
        pendingShared = null;
        const savedTimeZone = saved.display?.timeZone;
        const draft: ReportFilters = { ...current.draft, ...saved.draft, ...shared?.filters };
        return {
          ...current,
          draft,
          // Link compartilhado já gera o relatório (se os filtros dele forem válidos).
          applied: shared && validateFilters(draft) === null ? draft : current.applied,
          display: {
            ...current.display,
            ...saved.display,
            timeZone: isReportTimeZone(savedTimeZone) ? savedTimeZone : current.display.timeZone,
            ...shared?.display,
          },
        };
      },
      // Depois de aplicado, o link sai da barra de endereço: recarregar não o reaplica.
      onRehydrateStorage: () => () => clearShareSearch(),
    },
  ),
);

function subscribeToHydration(onChange: () => void) {
  return useReportFiltersStore.persist.onFinishHydration(onChange);
}

/** `true` quando os valores salvos no IndexedDB já foram carregados no store. */
export function useReportFiltersHydrated(): boolean {
  return useSyncExternalStore(subscribeToHydration, () => useReportFiltersStore.persist.hasHydrated());
}
