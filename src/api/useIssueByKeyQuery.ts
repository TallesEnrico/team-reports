import { useQuery } from '@tanstack/react-query';
import { fetchIssue, isIssueKey } from './jira-issues';
import { jiraKeys } from './queryKeys';
import { retryUnlessClientError } from './retryPolicy';

/** Issue do modal aberto pelo endereço (`?issue=CHAVE`) que a tela não tem (ex: não é um card do quadro). */
export function useIssueByKeyQuery(issueKey: string | null, enabled: boolean) {
  return useQuery({
    queryKey: jiraKeys.issue(issueKey ?? ''),
    queryFn: ({ signal }) => fetchIssue(issueKey!, signal),
    enabled: enabled && isIssueKey(issueKey),
    staleTime: 30_000,
    retry: retryUnlessClientError,
  });
}
