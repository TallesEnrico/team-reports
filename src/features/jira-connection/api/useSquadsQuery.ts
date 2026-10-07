import { useQuery } from '@tanstack/react-query';
import { type JiraSignIn, fetchSquads } from './connection-api';

/** Lista de squads para o assistente; só roda depois que as credenciais foram validadas. */
export function useSquadsQuery(auth: JiraSignIn | null) {
  return useQuery({
    // O token fica fora da chave: chaves de query aparecem em ferramentas de debug.
    queryKey: ['jira-connection', 'squads', auth?.email, auth?.cloudId],
    queryFn: ({ signal }) => fetchSquads(auth!, signal),
    enabled: auth !== null,
    staleTime: 10 * 60_000,
    retry: false,
  });
}
