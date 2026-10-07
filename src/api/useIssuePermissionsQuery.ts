import { useQuery } from '@tanstack/react-query';
import { useIsJiraConnected } from '../store/useJiraConnectionStore';
import { fetchIssuePermissions } from './jira-access';
import { jiraKeys } from './queryKeys';
import { retryUnlessClientError } from './retryPolicy';

/** O que a conta conectada pode fazer na issue (o modal só mostra as edições permitidas). */
export function useIssuePermissionsQuery(issueKey: string, enabled = true) {
  const isConnected = useIsJiraConnected();
  return useQuery({
    queryKey: jiraKeys.issuePermissions(issueKey),
    queryFn: ({ signal }) => fetchIssuePermissions(issueKey, signal),
    enabled: isConnected && enabled,
    staleTime: 5 * 60_000,
    retry: retryUnlessClientError,
  });
}
