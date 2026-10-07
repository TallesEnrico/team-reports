import { useQuery } from '@tanstack/react-query';
import { useIsJiraConnected } from '../store/useJiraConnectionStore';
import { fetchHasWriteAccess } from './jira-access';
import { jiraKeys } from './queryKeys';
import { retryUnlessClientError } from './retryPolicy';

/**
 * Se o token conectado tem o escopo de escrita (`write:jira-work`). Sem ele,
 * as telas ficam só leitura: sem editar ou lançar horas e sem mover cards.
 */
export function useJiraWriteAccessQuery() {
  const isConnected = useIsJiraConnected();
  return useQuery({
    queryKey: jiraKeys.writeAccess(),
    queryFn: ({ signal }) => fetchHasWriteAccess(signal),
    // O escopo só muda trocando de conta, e a troca limpa o cache.
    staleTime: Infinity,
    enabled: isConnected,
    retry: retryUnlessClientError,
  });
}

/**
 * Leitura pronta para a tela: `canWrite` enquanto o teste não respondeu é falso
 * (sem botões de escrita); se ele falhar por rede, deixa escrever e o erro real
 * aparece ao salvar. `isReadOnly` só com a resposta "sem escopo".
 */
export function useJiraWriteAccess() {
  const query = useJiraWriteAccessQuery();
  return { canWrite: query.data ?? query.isError, isReadOnly: query.data === false };
}
