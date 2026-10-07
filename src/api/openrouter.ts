/**
 * OpenRouter: a IA que monta e edita dashboards no Dashboard. O navegador
 * chama a API direto (ela libera CORS), com a chave de cada pessoa, que fica
 * cifrada no IndexedDB (`useOpenRouterStore`). Só vai para lá a estrutura do
 * dashboard e o pedido da pessoa, nunca dados do Jira (ver `lib/ai` do builder).
 */
export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';
/** Criar a conta (grátis). */
export const OPENROUTER_SIGNUP_URL = 'https://openrouter.ai/sign-up';
/** Gerar a chave (pede login; sem conta, a OpenRouter leva ao cadastro). */
export const OPENROUTER_KEYS_URL = 'https://openrouter.ai/settings/keys';
/** Privacidade: alguns modelos gratuitos só respondem com os "free endpoints" liberados aqui. */
export const OPENROUTER_PRIVACY_URL = 'https://openrouter.ai/settings/privacy';

/** "Automático": o primeiro modelo preferido disponível, com os seguintes de reserva. */
export const AUTO_AI_MODEL = 'auto';
export const DEFAULT_AI_MODEL = AUTO_AI_MODEL;

/** O roteador da OpenRouter: um modelo gratuito qualquer (às vezes um lento). A última reserva. */
const FREE_ROUTER_MODEL = 'openrouter/free';

/**
 * Modelos gratuitos testados com o catálogo de peças, do melhor para o pior
 * (rápidos e com o JSON certo de primeira). A lista da OpenRouter muda: só valem
 * os que ainda estão nela.
 */
const PREFERRED_AI_MODELS = [
  // ~10 s por dashboard.
  'nvidia/nemotron-3-super-120b-a12b:free',
  // Entende melhor pedidos vagos ("comparar pessoas"), mas leva ~40 s.
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
  'qwen/qwen3.8-27b:free',
];

/** Pedido que passa disso é cancelado (modelos gratuitos às vezes ficam na fila). */
const CHAT_TIMEOUT_MS = 150_000;

export type OpenRouterProblem =
  | 'invalid-key'
  | 'no-credits'
  | 'rate-limited'
  | 'data-policy'
  | 'model-unavailable'
  | 'timeout'
  | 'network'
  | 'unknown';

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly problem: OpenRouterProblem,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterKeyInfo {
  /** "sk-or-v1-763...820": o rótulo que a OpenRouter mostra, sem a chave inteira. */
  label: string;
  isFreeTier: boolean;
  /** Pedidos aos modelos gratuitos hoje; `null` se a OpenRouter não disser. */
  freeRequests: { used: number; limit: number; remaining: number } | null;
}

export interface AiModel {
  id: string;
  name: string;
  contextLength: number;
  /** Aceita `response_format: json_object` (resposta sempre em JSON). */
  supportsJson: boolean;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    // Identificam o app no painel de uso da pessoa na OpenRouter.
    'HTTP-Referer': window.location.origin,
    'X-Title': 'Team Reports',
  };
}

/** A mensagem de erro que a OpenRouter mandou no corpo, se houver. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    return typeof body.error?.message === 'string' ? body.error.message : '';
  } catch {
    return '';
  }
}

/** Erro da OpenRouter com a orientação do que fazer. */
function describeFailure(status: number, detail: string, model?: string): OpenRouterError {
  const reason = detail ? ` (OpenRouter: ${detail})` : '';
  const theModel = model ? `O modelo ${model}` : 'O modelo';
  if (status === 401 || (status === 403 && /key|auth|credential/i.test(detail) && !/model/i.test(detail))) {
    return new OpenRouterError(
      `A OpenRouter recusou a chave: ela não existe mais ou foi desativada. Gere uma chave nova e troque aqui.${reason}`,
      'invalid-key',
      status,
    );
  }
  if (status === 402) {
    return new OpenRouterError(`Sem créditos para este modelo. Escolha um modelo gratuito.${reason}`, 'no-credits', status);
  }
  if (status === 429) {
    // O limite diário da conta é outro caso: o modelo sobrecarregado no provedor volta em instantes.
    const daily = /per-day|daily/i.test(detail);
    return new OpenRouterError(
      daily
        ? `Os pedidos gratuitos de hoje acabaram: sem créditos, a OpenRouter libera 50 por dia. Tente amanhã ou ponha créditos na conta.${reason}`
        : `${theModel} está sobrecarregado agora (limite do provedor gratuito). Tente daqui a pouco ou escolha outro modelo.${reason}`,
      'rate-limited',
      status,
    );
  }
  if (/data policy|privacy|free endpoints/i.test(detail)) {
    return new OpenRouterError(
      `Este modelo gratuito só responde com os "free endpoints" liberados nas configurações de privacidade da OpenRouter. Libere lá ou escolha outro modelo.${reason}`,
      'data-policy',
      status,
    );
  }
  if (status === 403 || status === 404 || (status === 400 && /model/i.test(detail))) {
    return new OpenRouterError(`${theModel} não está disponível para o app agora. Escolha outro.${reason}`, 'model-unavailable', status);
  }
  if (status >= 500) {
    return new OpenRouterError(
      `O modelo não respondeu (erro ${status}). Tente de novo ou escolha outro modelo.${reason}`,
      'model-unavailable',
      status,
    );
  }
  return new OpenRouterError(`A OpenRouter recusou o pedido (erro ${status}).${reason}`, 'unknown', status);
}

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new OpenRouterError('Não foi possível falar com a OpenRouter. Confira a sua conexão e tente de novo.', 'network');
  }
}

/** Confere a chave e devolve o uso dela (não gasta pedidos). */
export async function fetchOpenRouterKeyInfo(apiKey: string, signal?: AbortSignal): Promise<OpenRouterKeyInfo> {
  const response = await send(`${OPENROUTER_API_URL}/key`, { headers: authHeaders(apiKey), signal });
  if (!response.ok) throw describeFailure(response.status, await readErrorMessage(response));
  const body = (await response.json()) as {
    data?: {
      label?: unknown;
      is_free_tier?: unknown;
      free_model_daily_requests?: { used?: unknown; limit?: unknown; remaining?: unknown };
    };
  };
  const data = body.data ?? {};
  const daily = data.free_model_daily_requests;
  const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  return {
    label: typeof data.label === 'string' ? data.label : '',
    isFreeTier: data.is_free_tier === true,
    freeRequests:
      daily && isNumber(daily.used) && isNumber(daily.limit) && isNumber(daily.remaining)
        ? { used: daily.used, limit: daily.limit, remaining: daily.remaining }
        : null,
  };
}

interface RawModel {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
  architecture?: { input_modalities?: unknown; output_modalities?: unknown };
  supported_parameters?: unknown;
}

const includes = (list: unknown, item: string) => Array.isArray(list) && list.includes(item);

/**
 * Os modelos gratuitos de texto, com contexto para o catálogo de peças (a
 * lista muda com frequência na OpenRouter). Pública: não usa a chave.
 */
export async function fetchFreeAiModels(signal?: AbortSignal): Promise<AiModel[]> {
  const response = await send(`${OPENROUTER_API_URL}/models`, { signal });
  if (!response.ok) throw describeFailure(response.status, await readErrorMessage(response));
  const body = (await response.json()) as { data?: RawModel[] };
  return (body.data ?? [])
    .filter((model): model is RawModel & { id: string } => typeof model.id === 'string')
    .filter((model) => {
      const free = model.id.endsWith(':free') || (model.pricing?.prompt === '0' && model.pricing?.completion === '0');
      const text = includes(model.architecture?.input_modalities, 'text') && includes(model.architecture?.output_modalities, 'text');
      const context = typeof model.context_length === 'number' ? model.context_length : 0;
      // Modelos de moderação respondem "seguro/inseguro", não montam nada.
      return free && text && context >= 32_000 && !/safety|guard/i.test(model.id);
    })
    .map((model) => ({
      id: model.id,
      name: typeof model.name === 'string' ? model.name : model.id,
      contextLength: model.context_length as number,
      supportsJson: includes(model.supported_parameters, 'response_format'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/**
 * O modelo do pedido e os de reserva. Sem a lista de modelos (a busca falhou),
 * vai o roteador gratuito da OpenRouter.
 */
export function resolveAiModels(choice: string, available: AiModel[] | undefined): { model: string; fallbacks: string[]; jsonMode: boolean } {
  if (!available) return { model: choice === AUTO_AI_MODEL ? FREE_ROUTER_MODEL : choice, fallbacks: [], jsonMode: false };
  const ids = new Set(available.map((model) => model.id));
  const preferred = PREFERRED_AI_MODELS.filter((id) => ids.has(id));
  const ordered = choice === AUTO_AI_MODEL ? preferred : [choice, ...preferred.filter((id) => id !== choice)];
  const [model = FREE_ROUTER_MODEL, ...rest] = ordered;
  const fallbacks = [...rest, FREE_ROUTER_MODEL].filter((id) => id !== model).slice(0, 2);
  return { model, fallbacks, jsonMode: available.find((item) => item.id === model)?.supportsJson ?? false };
}

interface ChatRequest {
  apiKey: string;
  model: string;
  /**
   * Outros modelos, na ordem, se o escolhido estiver fora do ar, sobrecarregado
   * ou recusar (a própria OpenRouter troca; vale o primeiro que responder).
   */
  fallbackModels?: string[];
  messages: ChatMessage[];
  /** Pede a resposta em JSON (só nos modelos que aceitam `response_format`). */
  jsonMode: boolean;
  signal?: AbortSignal;
}

export interface ChatAnswer {
  content: string;
  /** O modelo que respondeu (com fallback, pode não ser o escolhido). */
  model: string;
}

/** Uma resposta do modelo (o texto da primeira escolha). */
export async function requestChatCompletion({
  apiKey,
  model,
  fallbackModels = [],
  messages,
  jsonMode,
  signal,
}: ChatRequest): Promise<ChatAnswer> {
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), CHAT_TIMEOUT_MS);
  const abort = () => timeout.abort();
  signal?.addEventListener('abort', abort);
  try {
    const response = await send(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      headers: { ...authHeaders(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        ...(fallbackModels.length > 0 ? { models: [model, ...fallbackModels.filter((other) => other !== model)].slice(0, 3) } : {}),
        messages,
        temperature: 0.2,
        max_tokens: 12_000,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: timeout.signal,
    });
    if (!response.ok) throw describeFailure(response.status, await readErrorMessage(response), model);
    const body = (await response.json()) as {
      model?: unknown;
      error?: { message?: unknown; code?: unknown };
      choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
    };
    // Falhas do provedor do modelo podem vir com 200 e o erro no corpo.
    if (body.error) {
      const status = typeof body.error.code === 'number' ? body.error.code : 502;
      throw describeFailure(status, typeof body.error.message === 'string' ? body.error.message : '', model);
    }
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new OpenRouterError('O modelo não devolveu resposta. Tente de novo ou escolha outro modelo.', 'model-unavailable');
    }
    return { content, model: typeof body.model === 'string' ? body.model : model };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (signal?.aborted) throw error;
      throw new OpenRouterError('O modelo demorou demais para responder. Tente de novo ou escolha outro modelo.', 'timeout');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
