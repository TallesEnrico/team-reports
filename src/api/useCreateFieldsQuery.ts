import { useQuery } from '@tanstack/react-query';
import { useIsJiraConnected } from '../store/useJiraConnectionStore';
import { fetchCreateFields } from './jira-issues';
import { jiraKeys } from './queryKeys';
import { retryUnlessClientError } from './retryPolicy';

/** Campos da tela de criação do projeto para o tipo de issue (o formulário de criar filha mostra e valida por eles). */
export function useCreateFieldsQuery(projectKey: string, issueTypeId: string | undefined) {
  const isConnected = useIsJiraConnected();
  return useQuery({
    queryKey: jiraKeys.createFields(projectKey, issueTypeId ?? ''),
    queryFn: ({ signal }) => fetchCreateFields(projectKey, issueTypeId!, signal),
    enabled: isConnected && Boolean(issueTypeId),
    staleTime: 30 * 60_000,
    retry: retryUnlessClientError,
  });
}
