import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOpenRouterStore } from '../store/useOpenRouterStore';
import { fetchOpenRouterKeyInfo, OpenRouterError } from './openrouter';
import { openRouterKeys } from './queryKeys';

/** Confere a chave na OpenRouter e, se ela vale, salva cifrada neste navegador. */
export function useConnectOpenRouterMutation() {
  const connect = useOpenRouterStore((state) => state.connect);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (apiKey: string) => {
      const key = apiKey.trim();
      if (!/^sk-or-[\w-]{10,}$/.test(key)) {
        throw new OpenRouterError('Isso não parece uma chave da OpenRouter: ela começa com "sk-or-".', 'invalid-key');
      }
      const info = await fetchOpenRouterKeyInfo(key);
      await connect(key);
      return { key, info };
    },
    // O uso já veio na conferência: a linha da chave aparece sem buscar de novo.
    onSuccess: ({ key, info }) => queryClient.setQueryData(openRouterKeys.keyInfo(key.slice(-8)), info),
  });
}
