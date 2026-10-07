import type { QueryClient } from '@tanstack/react-query';
import type { JiraIssue } from './jira-issues';
import { jiraKeys } from './queryKeys';

/** Formato de toda lista de issues em cache sob `jiraKeys.issueLists()`. */
export interface CachedIssueList {
  issues: JiraIssue[];
}

/** A issue está em alguma lista em cache (ex: é um card de um quadro já carregado). */
export function isCachedIssue(queryClient: QueryClient, issueId: string): boolean {
  return queryClient
    .getQueriesData<CachedIssueList>({ queryKey: jiraKeys.issueLists() })
    .some(([, data]) => data?.issues.some((current) => current.id === issueId));
}

/**
 * Troca uma issue em todas as listas em cache (ex: cards dos quadros), sem
 * buscar nada de novo. Devolve `false` se ela não está em nenhuma (ex: história pai).
 */
export function replaceCachedIssue(queryClient: QueryClient, issue: JiraIssue): boolean {
  if (!isCachedIssue(queryClient, issue.id)) return false;
  queryClient.setQueriesData<CachedIssueList>({ queryKey: jiraKeys.issueLists() }, (data) =>
    data && { ...data, issues: data.issues.map((current) => (current.id === issue.id ? issue : current)) },
  );
  return true;
}
