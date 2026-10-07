import { useQuery } from '@tanstack/react-query';
import { fetchChildIssues } from './jira-issues';
import { jiraKeys } from './queryKeys';
import { retryUnlessClientError } from './retryPolicy';

/** Subtarefas (ou issues do épico) para o modal da issue pai. */
export function useChildIssuesQuery(issueKey: string, enabled: boolean) {
  return useQuery({
    queryKey: jiraKeys.issueChildren(issueKey),
    queryFn: ({ signal }) => fetchChildIssues(issueKey, signal),
    enabled,
    staleTime: 30_000,
    retry: retryUnlessClientError,
  });
}
