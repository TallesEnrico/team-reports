import { useQuery } from '@tanstack/react-query';
import { useIsJiraConnected, useJiraConnectionStore } from '../store/useJiraConnectionStore';
import { fetchJiraSiteDomain } from './jira-site';
import { jiraKeys } from './queryKeys';
import { retryUnlessClientError } from './retryPolicy';

/**
 * Domínio do site do Jira (`DOMINIO.atlassian.net`). O do cadastro, quando a
 * conta tem; senão, uma busca por sessão em `serverInfo`. Só com a conta
 * conectada; sem token, logo e favicon ficam nos arquivos padrão do app.
 */
export function useJiraSiteDomainQuery() {
  const isConnected = useIsJiraConnected();
  const domain = useJiraConnectionStore((state) => state.credentials?.domain);
  const query = useQuery({
    queryKey: jiraKeys.siteDomain(),
    queryFn: ({ signal }) => fetchJiraSiteDomain(signal),
    staleTime: Infinity,
    enabled: isConnected && !domain,
    retry: retryUnlessClientError,
  });
  if (!isConnected) return { ...query, data: undefined };
  if (domain) return { ...query, data: domain };
  return query;
}
