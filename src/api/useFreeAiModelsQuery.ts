import { useQuery } from '@tanstack/react-query';
import { fetchFreeAiModels } from './openrouter';
import { openRouterKeys } from './queryKeys';

/** Os modelos gratuitos da OpenRouter (a lista muda com frequência; não usa a chave). */
export function useFreeAiModelsQuery(enabled = true) {
  return useQuery({
    queryKey: openRouterKeys.freeModels(),
    queryFn: ({ signal }) => fetchFreeAiModels(signal),
    enabled,
    staleTime: 30 * 60_000,
    retry: 1,
  });
}
