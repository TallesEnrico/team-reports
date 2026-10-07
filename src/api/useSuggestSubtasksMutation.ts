import { useMutation } from '@tanstack/react-query';
import { generateSubtaskSuggestions, type SubtaskContext } from '../lib/aiSubtasks';
import { useAiCompletion } from './useAiCompletion';

interface SuggestSubtasksVariables {
  context: SubtaskContext;
  /** Cancela o pedido ("Cancelar", fechar as sugestões). */
  signal: AbortSignal;
}

/**
 * Pede à IA (OpenRouter, direto do navegador) subtarefas para a história:
 * título, descrição, estimativa, tipo de atividade e atividade de cada uma.
 */
export function useSuggestSubtasksMutation() {
  const complete = useAiCompletion();
  return useMutation({
    mutationFn: ({ context, signal }: SuggestSubtasksVariables) =>
      generateSubtaskSuggestions(context, (messages) => complete(messages, signal)),
  });
}
