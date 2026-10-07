import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useIsJiraConnected } from '../store/useJiraConnectionStore';
import { type AssignableScope, searchAssignableUsers, searchUsers } from './jira-users';
import { jiraKeys } from './queryKeys';
import { retryUnlessClientError } from './retryPolicy';

/**
 * De onde vêm as pessoas de um campo: quem pode ser responsável (pela issue ou
 * no projeto, já com a lista sem busca) ou qualquer pessoa do Jira (relator; só
 * com busca).
 */
export type UserSource = ({ kind: 'assignable' } & AssignableScope) | { kind: 'any' };

/** Letras mínimas para buscar qualquer pessoa do Jira. */
export const USER_SEARCH_MIN_LENGTH = 2;

/** Opções de um campo de pessoa (responsável, relator), pela busca digitada. */
export function useUserOptionsQuery(source: UserSource, query: string) {
  const isConnected = useIsJiraConnected();
  const trimmed = query.trim();
  return useQuery({
    queryKey: jiraKeys.userOptions(source, trimmed),
    queryFn: ({ signal }) =>
      source.kind === 'assignable' ? searchAssignableUsers(source, trimmed, signal) : searchUsers(trimmed, signal),
    enabled: isConnected && (source.kind === 'assignable' || trimmed.length >= USER_SEARCH_MIN_LENGTH),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    retry: retryUnlessClientError,
  });
}
