import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { retryUnlessClientError } from '../../../api/retryPolicy';
import { useIsJiraConnected } from '../../../store/useJiraConnectionStore';
import type { MonthKey, MonthWorklogs } from '../types';
import { fetchOtherProjectsMonth, fetchSquadMonth } from './metrics-api';
import { metricsKeys } from './queryKeys';

export interface MonthsQueries {
  /** Dados de cada mês, na ordem pedida; `undefined` enquanto carrega. */
  data: (MonthWorklogs | undefined)[];
  error: Error | null;
  isFetching: boolean;
}

// Fora do componente: o resultado só é recalculado quando alguma query muda.
function combineMonths(results: UseQueryResult<MonthWorklogs>[]): MonthsQueries {
  return {
    data: results.map((result) => result.data),
    error: results.find((result) => result.error)?.error ?? null,
    isFetching: results.some((result) => result.isFetching),
  };
}

/** O mês corrente ainda recebe horas; os anteriores quase não mudam. */
function staleTimeOf(month: MonthKey, currentMonth: MonthKey): number {
  return month >= currentMonth ? 5 * 60_000 : 30 * 60_000;
}

/**
 * Horas de cada mês nas issues das squads, de qualquer pessoa. `months` vem do
 * mês escolhido para trás: a posição é a prioridade na fila de requisições.
 */
export function useSquadMonthsQueries(months: MonthKey[], projectKeys: string[] | undefined, currentMonth: MonthKey) {
  const isConnected = useIsJiraConnected();
  return useQueries({
    queries: months.map((month, index) => ({
      queryKey: metricsKeys.squadMonth(month, projectKeys ?? []),
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchSquadMonth(month, projectKeys!, index, signal),
      enabled: isConnected && Boolean(projectKeys?.length),
      staleTime: staleTimeOf(month, currentMonth),
      gcTime: 60 * 60_000,
      retry: retryUnlessClientError,
    })),
    combine: combineMonths,
  });
}

/**
 * Horas de cada mês das pessoas da equipe em issues de fora das squads (sem
 * squad, em qualquer projeto). Espera a equipe (`accountIds`) estar definida;
 * vazia, não busca nada.
 */
export function useOtherProjectsMonthsQueries(
  months: MonthKey[],
  projectKeys: string[] | undefined,
  accountIds: string[] | undefined,
  currentMonth: MonthKey,
) {
  const isConnected = useIsJiraConnected();
  return useQueries({
    queries: months.map((month, index) => ({
      queryKey: metricsKeys.otherProjectsMonth(month, projectKeys ?? [], accountIds ?? []),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchOtherProjectsMonth(month, projectKeys!, accountIds!, index, signal),
      enabled: isConnected && Boolean(projectKeys) && Boolean(accountIds?.length),
      staleTime: staleTimeOf(month, currentMonth),
      gcTime: 60 * 60_000,
      retry: retryUnlessClientError,
    })),
    combine: combineMonths,
  });
}
