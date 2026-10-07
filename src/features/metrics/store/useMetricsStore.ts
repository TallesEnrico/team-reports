import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createIndexedDbStorage } from '../../../lib/indexedDbStorage';
import { DEFAULT_DAY_RANGES, withDayRange } from '../lib/dayRanges';
import type { CompareMonths, DayRanges, HoursScope, JiraUser, MonthKey, PeopleSort, PersonFilter } from '../types';

/** Chave das pessoas escolhidas para as squads (`peopleByProject`): uma squad só é a chave dela; nenhuma, `''`. */
export function squadsKey(projectKeys: string[]): string {
  return [...projectKeys].sort().join(',');
}

/**
 * Pessoas escolhidas: as contas (accountIds) ou `'all'`, todas as pessoas (com
 * squad, quem lançou horas nela e quem pode ser responsável nela; sem squad, todas
 * as pessoas do Jira).
 */
export type PeopleChoice = string[] | 'all';

interface MetricsState {
  /** Squads (projetos), na ordem escolhida; `null` = a squad da conta conectada; `[]` = nenhuma. */
  projectKeys: string[] | null;
  /**
   * Pessoas escolhidas por squad ou conjunto de squads (`squadsKey`); sem escolha
   * (ou lista vazia), quem lançou horas nas squads.
   */
  peopleByProject: Record<string, PeopleChoice>;
  /**
   * Nome e foto das pessoas escolhidas, pelo accountId: quem veio de fora da squad
   * e ainda não lançou horas não aparece em nenhuma outra lista.
   */
  knownPeople: Record<string, JiraUser>;
  /**
   * Contas do Jira da mesma pessoa (ex: uma conta antiga, de outro e-mail):
   * conta juntada → conta principal. Vale para todas as squads.
   */
  mergedAccounts: Record<string, string>;
  compareMonths: CompareMonths;
  /** Faixas das horas de um dia útil (cores dos dias); `success` é a jornada, o esperado por dia útil. */
  dayRanges: DayRanges;
  scope: HoursScope;
  sort: PeopleSort;
  /** Mês mostrado; `null` = o padrão (o do último dia útil que passou). Só na sessão: voltar outro dia abre o padrão. */
  month: MonthKey | null;
  /** Recorte da lista de pessoas, só na sessão. */
  personFilter: PersonFilter;
  /** Troca as squads; as pessoas escolhidas são por conjunto de squads e o recorte da lista volta a "todas". */
  selectProjects: (projectKeys: string[] | null) => void;
  setPeople: (projectKeys: string[], people: JiraUser[] | 'all') => void;
  /** Passa a contar as horas de `accountId` como de `intoAccountId`. */
  mergeAccounts: (accountId: string, intoAccountId: string) => void;
  /** Desfaz a junção: a conta volta a ser uma pessoa à parte. */
  splitAccount: (accountId: string) => void;
  setCompareMonths: (compareMonths: CompareMonths) => void;
  /** Muda um limite das faixas; os outros se ajustam para manter `danger <= alert <= success`. */
  setDayRange: (key: keyof DayRanges, seconds: number) => void;
  setScope: (scope: HoursScope) => void;
  setSort: (sort: PeopleSort) => void;
  setMonth: (month: MonthKey | null) => void;
  setPersonFilter: (personFilter: PersonFilter) => void;
}

type PersistedMetrics = Pick<
  MetricsState,
  'projectKeys' | 'peopleByProject' | 'knownPeople' | 'mergedAccounts' | 'compareMonths' | 'dayRanges' | 'scope' | 'sort'
>;

export const useMetricsStore = create<MetricsState>()(
  persist(
    (set) => ({
      projectKeys: null,
      peopleByProject: {},
      knownPeople: {},
      mergedAccounts: {},
      compareMonths: 3,
      dayRanges: DEFAULT_DAY_RANGES,
      scope: 'all',
      sort: { key: 'coverage', direction: 'asc' },
      month: null,
      personFilter: 'all',
      selectProjects: (projectKeys) => set({ projectKeys, personFilter: 'all' }),
      setPeople: (projectKeys, people) =>
        set((state) => {
          const peopleByProject = {
            ...state.peopleByProject,
            [squadsKey(projectKeys)]: people === 'all' ? people : people.map((person) => person.accountId),
          };
          // Só ficam os nomes de quem está em alguma escolha.
          const chosen = new Set(Object.values(peopleByProject).flatMap((choice) => (choice === 'all' ? [] : choice)));
          const knownPeople: Record<string, JiraUser> = {};
          for (const person of [...Object.values(state.knownPeople), ...(people === 'all' ? [] : people)]) {
            if (chosen.has(person.accountId)) knownPeople[person.accountId] = person;
          }
          return { peopleByProject, knownPeople };
        }),
      mergeAccounts: (accountId, intoAccountId) =>
        set((state) => {
          // Sempre direto para a principal: sem cadeias (A → B → C vira A → C, B → C).
          const target = state.mergedAccounts[intoAccountId] ?? intoAccountId;
          if (target === accountId) return {};
          const mergedAccounts: Record<string, string> = {};
          for (const [from, to] of Object.entries(state.mergedAccounts)) mergedAccounts[from] = to === accountId ? target : to;
          mergedAccounts[accountId] = target;
          return { mergedAccounts };
        }),
      splitAccount: (accountId) =>
        set((state) => {
          const mergedAccounts = { ...state.mergedAccounts };
          delete mergedAccounts[accountId];
          return { mergedAccounts };
        }),
      setCompareMonths: (compareMonths) => set({ compareMonths }),
      setDayRange: (key, seconds) => set((state) => ({ dayRanges: withDayRange(state.dayRanges, key, seconds) })),
      setScope: (scope) => set({ scope }),
      setSort: (sort) => set({ sort }),
      setMonth: (month) => set({ month }),
      setPersonFilter: (personFilter) => set({ personFilter }),
    }),
    {
      name: 'team-report:metrics',
      version: 3,
      storage: createIndexedDbStorage<PersistedMetrics>(),
      migrate: (persisted, version) => {
        let state = persisted as Record<string, unknown>;
        // v1: uma squad só. As pessoas escolhidas continuam valendo (a chave de uma squad é a chave dela).
        if (version < 2) {
          const { projectKey, ...rest } = state;
          state = { ...rest, projectKeys: typeof projectKey === 'string' ? [projectKey] : null };
        }
        // v2: só a jornada, em horas; ela vira o limite do verde.
        if (version < 3) {
          const { dailyTargetHours, ...rest } = state;
          const success = typeof dailyTargetHours === 'number' ? dailyTargetHours * 3600 : DEFAULT_DAY_RANGES.success;
          state = { ...rest, dayRanges: withDayRange(DEFAULT_DAY_RANGES, 'success', success) };
        }
        return state as unknown as PersistedMetrics;
      },
      partialize: (state): PersistedMetrics => ({
        projectKeys: state.projectKeys,
        peopleByProject: state.peopleByProject,
        knownPeople: state.knownPeople,
        mergedAccounts: state.mergedAccounts,
        compareMonths: state.compareMonths,
        dayRanges: state.dayRanges,
        scope: state.scope,
        sort: state.sort,
      }),
    },
  ),
);

function subscribeToHydration(onChange: () => void) {
  return useMetricsStore.persist.onFinishHydration(onChange);
}

/** `true` quando a squad e as preferências salvas já foram lidas do IndexedDB. */
export function useMetricsStoreHydrated(): boolean {
  return useSyncExternalStore(subscribeToHydration, () => useMetricsStore.persist.hasHydrated());
}
