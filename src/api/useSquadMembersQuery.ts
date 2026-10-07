import { queryOptions, useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useIsJiraConnected } from '../store/useJiraConnectionStore';
import { fetchRecentSquadAuthors, fetchSquadMembers, type JiraUser } from './jira-users';
import { jiraKeys } from './queryKeys';
import { retryUnlessClientError } from './retryPolicy';

const memberCollator = new Intl.Collator('pt-BR');

function squadMembersOptions(projectKey: string, enabled: boolean) {
  return queryOptions({
    queryKey: jiraKeys.squadMembers(projectKey),
    queryFn: ({ signal }) => fetchSquadMembers(projectKey, signal),
    enabled,
    staleTime: 30 * 60_000,
    retry: retryUnlessClientError,
  });
}

/** Pessoas que podem ser responsáveis na squad (opções do filtro de pessoas do Kanban). */
export function useSquadMembersQuery(projectKey: string | undefined) {
  const isConnected = useIsJiraConnected();
  return useQuery(squadMembersOptions(projectKey ?? '', isConnected && Boolean(projectKey)));
}

export interface SquadsMembers {
  /** Quem pode ser responsável em alguma das squads, por nome; sem repetir a pessoa de várias squads. */
  data: JiraUser[];
  /** Alguma squad ainda sem a lista. */
  isPending: boolean;
  isError: boolean;
}

// Fora do componente: o resultado só é recalculado quando alguma query muda.
function combineMembers(results: UseQueryResult<JiraUser[]>[]): SquadsMembers {
  const byId = new Map<string, JiraUser>();
  for (const result of results) {
    for (const user of result.data ?? []) if (!byId.has(user.accountId)) byId.set(user.accountId, user);
  }
  return {
    data: [...byId.values()].sort((a, b) => memberCollator.compare(a.displayName, b.displayName)),
    isPending: results.some((result) => result.isPending),
    isError: results.some((result) => result.isError),
  };
}

function squadAuthorsOptions(projectKey: string, enabled: boolean) {
  return queryOptions({
    queryKey: jiraKeys.squadAuthors(projectKey),
    queryFn: ({ signal }) => fetchRecentSquadAuthors(projectKey, signal),
    enabled,
    staleTime: 30 * 60_000,
    retry: retryUnlessClientError,
  });
}

export function useSquadAuthorsQuery(projectKey: string | undefined) {
  const isConnected = useIsJiraConnected();
  return useQuery(squadAuthorsOptions(projectKey ?? '', isConnected && Boolean(projectKey)));
}

export function useSquadsAuthorsQuery(projectKeys: string[] | undefined): SquadsMembers {
  const isConnected = useIsJiraConnected();
  return useQueries({
    queries: (projectKeys ?? []).map((projectKey) => squadAuthorsOptions(projectKey, isConnected)),
    combine: combineMembers,
  });
}

/** Pessoas que podem ser responsáveis em alguma das squads (opções do filtro de pessoas do Metrics), uma busca por squad. */
export function useSquadsMembersQuery(projectKeys: string[] | undefined): SquadsMembers {
  const isConnected = useIsJiraConnected();
  return useQueries({
    queries: (projectKeys ?? []).map((projectKey) => squadMembersOptions(projectKey, isConnected)),
    combine: combineMembers,
  });
}
