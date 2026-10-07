import { useQuery } from '@tanstack/react-query';
import { useIsJiraConnected } from '../store/useJiraConnectionStore';
import { fetchCurrentUser } from './jira-users';
import { jiraKeys } from './queryKeys';
import { retryUnlessClientError } from './retryPolicy';

export function useCurrentUserQuery() {
  const isConnected = useIsJiraConnected();
  return useQuery({
    queryKey: jiraKeys.currentUser(),
    queryFn: ({ signal }) => fetchCurrentUser(signal),
    staleTime: Infinity,
    enabled: isConnected,
    retry: retryUnlessClientError,
  });
}
