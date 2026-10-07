import { useQuery } from '@tanstack/react-query';
import { useIsJiraConnected } from '../store/useJiraConnectionStore';
import { fetchCreatableIssueTypes } from './jira-issues';
import { jiraKeys } from './queryKeys';
import { retryUnlessClientError } from './retryPolicy';

/** Tipos de issue que a conta pode criar no projeto (para criar filhas no modal da issue pai). */
export function useCreatableIssueTypesQuery(projectKey: string, enabled: boolean) {
  const isConnected = useIsJiraConnected();
  return useQuery({
    queryKey: jiraKeys.creatableIssueTypes(projectKey),
    queryFn: ({ signal }) => fetchCreatableIssueTypes(projectKey, signal),
    enabled: isConnected && enabled,
    staleTime: 30 * 60_000,
    retry: retryUnlessClientError,
  });
}
