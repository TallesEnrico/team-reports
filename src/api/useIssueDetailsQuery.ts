import { useQuery } from '@tanstack/react-query';
import { fetchIssueDetails, fetchIssueWorklogList } from './jira-issues';
import { jiraKeys } from './queryKeys';
import { retryUnlessClientError } from './retryPolicy';

export function useIssueDetailsQuery(issueKey: string, enabled = true) {
  return useQuery({
    queryKey: jiraKeys.issueDetails(issueKey),
    queryFn: ({ signal }) => fetchIssueDetails(issueKey, signal),
    enabled,
    staleTime: 30_000,
    retry: retryUnlessClientError,
  });
}

export function useIssueWorklogsQuery(issueId: string) {
  return useQuery({
    queryKey: jiraKeys.issueWorklogs(issueId),
    queryFn: ({ signal }) => fetchIssueWorklogList(issueId, signal),
    staleTime: 30_000,
    retry: retryUnlessClientError,
  });
}
