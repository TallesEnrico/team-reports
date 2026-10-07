import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useOpenRouterStore } from '../store/useOpenRouterStore';
import {
  type ChatAnswer,
  type ChatMessage,
  fetchFreeAiModels,
  OpenRouterError,
  requestChatCompletion,
  resolveAiModels,
} from './openrouter';
import { openRouterKeys } from './queryKeys';

/**
 * Manda mensagens para a IA (OpenRouter, direto do navegador) com a chave e o
 * modelo da pessoa: "Automático" ou o escolhido, com os modelos de reserva.
 */
export function useAiCompletion(): (messages: ChatMessage[], signal?: AbortSignal) => Promise<ChatAnswer> {
  const apiKey = useOpenRouterStore((state) => state.apiKey);
  const choice = useOpenRouterStore((state) => state.model);
  const queryClient = useQueryClient();

  return useCallback(
    async (messages, signal) => {
      if (!apiKey) throw new OpenRouterError('Cadastre a sua chave da OpenRouter para usar a IA.', 'invalid-key');
      // A lista de modelos (do cache, se já veio): sem ela, o "Automático" cairia no roteador gratuito, às vezes lento.
      const available = await queryClient
        .ensureQueryData({ queryKey: openRouterKeys.freeModels(), queryFn: ({ signal: listSignal }) => fetchFreeAiModels(listSignal) })
        .catch(() => undefined);
      const { model, fallbacks, jsonMode } = resolveAiModels(choice, available);
      try {
        return await requestChatCompletion({ apiKey, model, fallbackModels: fallbacks, messages, jsonMode, signal });
      } finally {
        // Cada pedido gasta da cota gratuita do dia: a linha da chave mostra o que sobrou.
        void queryClient.invalidateQueries({ queryKey: openRouterKeys.keyInfo(apiKey.slice(-8)) });
      }
    },
    [apiKey, choice, queryClient],
  );
}
