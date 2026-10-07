import { useMutation } from '@tanstack/react-query';
import { useAiCompletion } from '../../../api/useAiCompletion';
import { todayKey } from '../../../lib/dates';
import { BUILDER_TIME_ZONE } from '../hooks/useBuilderResults';
import { generateAiDashboard } from '../lib/ai/generate';
import type { Dashboard } from '../types';

interface AiDashboardVariables {
  prompt: string;
  /** O dashboard a mudar; sem ele, a IA monta um novo. */
  current?: Dashboard;
  /** Cancela o pedido (o "Cancelar" enquanto a IA monta). */
  signal: AbortSignal;
}

/**
 * Pede à IA (OpenRouter, direto do navegador) um dashboard novo ou a mudança de
 * um existente. Vão só o pedido e a estrutura do dashboard (`lib/ai`).
 */
export function useAiDashboardMutation() {
  const complete = useAiCompletion();
  return useMutation({
    mutationFn: ({ prompt, current, signal }: AiDashboardVariables) =>
      generateAiDashboard({
        prompt,
        current,
        today: todayKey(BUILDER_TIME_ZONE),
        complete: (messages) => complete(messages, signal),
      }),
  });
}
