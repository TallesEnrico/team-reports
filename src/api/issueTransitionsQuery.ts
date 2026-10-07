import { queryOptions } from '@tanstack/react-query';
import { fetchTransitions } from './jira-issues';
import { jiraKeys } from './queryKeys';

/** Transições possíveis da issue: buscadas ao abrir o status no modal ou ao começar a arrastar o card. */
export function transitionsQueryOptions(issueId: string) {
  return queryOptions({
    queryKey: jiraKeys.issueTransitions(issueId),
    queryFn: ({ signal }) => fetchTransitions(issueId, signal),
    staleTime: 30_000,
  });
}
