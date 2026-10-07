import { useQuery } from '@tanstack/react-query';
import { fetchOpenRouterKeyInfo } from './openrouter';
import { openRouterKeys } from './queryKeys';

/** Uso da chave da OpenRouter (quantos pedidos gratuitos sobram hoje). Não gasta pedidos. */
export function useOpenRouterKeyInfoQuery(apiKey: string | null) {
  return useQuery({
    queryKey: openRouterKeys.keyInfo(apiKey?.slice(-8) ?? ''),
    queryFn: ({ signal }) => fetchOpenRouterKeyInfo(apiKey!, signal),
    enabled: Boolean(apiKey),
    staleTime: 60_000,
    retry: false,
  });
}
