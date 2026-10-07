import type { ChatAnswer, ChatMessage } from '../../../../api/openrouter';
import type { DateKey } from '../../../../lib/dates';
import type { BuilderEdge, BuilderNode, Dashboard, PeriodConfig } from '../../types';
import { DEFAULT_DASHBOARD_PERIOD } from '../periods';
import { buildFixMessage, buildSystemPrompt, buildUserMessage } from './prompt';
import { extractJson } from '../../../../lib/extractJson';
import { dashboardToSpec, emptySpecContext, type SpecResult, specToDashboard } from './spec';

export interface AiDashboardRequest {
  /** O pedido da pessoa. */
  prompt: string;
  /** O dashboard a mudar; sem ele, a IA monta um novo. */
  current?: Dashboard;
  today: DateKey;
  /** Manda as mensagens para o modelo e devolve a resposta (a OpenRouter, na tela). */
  complete: (messages: ChatMessage[]) => Promise<ChatAnswer>;
}

export interface AiDashboardResult {
  name: string;
  period: PeriodConfig;
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  summary: string;
  /** O que foi corrigido aqui, depois da IA (para a pessoa conferir). */
  fixes: string[];
  /** O modelo que respondeu. */
  model: string;
}

export class AiDashboardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiDashboardError';
  }
}

type Attempt = { ok: true; result: SpecResult } | { ok: false; errors: string[] };

/**
 * Pede o dashboard à IA. A primeira resposta com erros (JSON quebrado, peças que
 * não encaixam, campos que não existem) volta para ela com a lista dos erros; a
 * segunda é corrigida aqui no que der. Só vai para a IA o pedido e a estrutura
 * do dashboard, sem nenhum dado do Jira (`dashboardToSpec`).
 */
export async function generateAiDashboard({ prompt, current, today, complete }: AiDashboardRequest): Promise<AiDashboardResult> {
  const { spec, context } = current ? dashboardToSpec(current) : { spec: undefined, context: emptySpecContext() };
  const options = {
    fallbackName: current?.name ?? 'Dashboard da IA',
    fallbackPeriod: current?.period ?? DEFAULT_DASHBOARD_PERIOD,
  };
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(today) },
    { role: 'user', content: buildUserMessage(prompt, spec) },
  ];

  const read = (answer: string, autoFix: boolean): Attempt => {
    let raw: unknown;
    try {
      raw = extractJson(answer);
    } catch {
      return { ok: false, errors: ['A resposta não é um JSON válido. Devolva só o objeto JSON, sem texto em volta.'] };
    }
    const result = specToDashboard(raw, context, { ...options, autoFix });
    return result.problems.length > 0 ? { ok: false, errors: result.problems } : { ok: true, result };
  };

  let answer = await complete(messages);
  let attempt = read(answer.content, false);
  if (!attempt.ok) {
    messages.push({ role: 'assistant', content: answer.content }, { role: 'user', content: buildFixMessage(attempt.errors) });
    answer = await complete(messages);
    attempt = read(answer.content, true);
  }
  if (!attempt.ok) {
    throw new AiDashboardError(
      `A IA não conseguiu montar um dashboard que encaixe (${attempt.errors[0]}). Tente de novo, detalhe mais o pedido ou escolha outro modelo.`,
    );
  }
  const { name, period, nodes, edges, summary, fixes } = attempt.result;
  return { name, period, nodes, edges, summary, fixes, model: answer.model };
}
