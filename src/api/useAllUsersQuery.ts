import { useQuery } from '@tanstack/react-query';
import { useIsJiraConnected } from '../store/useJiraConnectionStore';
import { fetchAllUsers } from './jira-users';
import { jiraKeys } from './queryKeys';
import { retryUnlessClientError } from './retryPolicy';

/** Todas as pessoas do Jira (opções do filtro de pessoas do Metrics, além das da squad). */
export function useAllUsersQuery() {
  const isConnected = useIsJiraConnected();
  return useQuery({
    queryKey: jiraKeys.allUsers(),
    queryFn: ({ signal }) => fetchAllUsers(signal),
    enabled: isConnected,
    staleTime: 30 * 60_000,
    retry: retryUnlessClientError,
  });
}
