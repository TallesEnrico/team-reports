import { type Env, jiraApiBase } from '../env';

type QueryParams = Record<string, string | number | boolean | undefined>;

/** Erro do Jira, com o que ele respondeu (`details`). */
export class JiraError extends Error {
  constructor(
    readonly status: number,
    readonly details: string[],
  ) {
    super(details[0] ?? `Erro ${status} no Jira`);
    this.name = 'JiraError';
  }
}

interface JiraErrorBody {
  errorMessages?: string[];
  errors?: Record<string, string>;
  message?: string;
}

async function readMessages(response: Response): Promise<string[]> {
  const text = (await response.text().catch(() => '')).trim();
  if (!text) return [];
  try {
    const body = JSON.parse(text) as JiraErrorBody | string;
    if (typeof body === 'string') return [body];
    const messages = [...(body.errorMessages ?? []), ...Object.values(body.errors ?? {})];
    if (body.message) messages.push(body.message);
    return messages;
  } catch {
    return [text.slice(0, 300)];
  }
}

export interface JiraClient {
  get<T>(path: string, params?: QueryParams): Promise<T>;
  post<T>(path: string, body: unknown, params?: QueryParams): Promise<T>;
  /** A conta das credenciais (uma busca só por chamada de ferramenta). */
  myself(): Promise<{ accountId: string; displayName: string; emailAddress?: string }>;
  /** Mensagem para a pessoa sobre um erro do Jira, conferindo o token num 401. */
  describe(error: unknown): Promise<string>;
}

/**
 * Cliente do Jira de uma chamada de ferramenta, com as credenciais que vieram no
 * header `Authorization` (nunca guardadas). Tudo pelo gateway da Atlassian, do
 * lado do servidor: POST também funciona (sem o check de XSRF do navegador).
 */
export function createJiraClient(env: Env, authorization: string): JiraClient {
  const base = jiraApiBase(env);
  let me: ReturnType<JiraClient['myself']> | undefined;

  async function request<T>(method: 'GET' | 'POST', path: string, params?: QueryParams, body?: unknown): Promise<T> {
    const url = new URL(`${base}/${path.replace(/^\//, '')}`);
    for (const [key, value] of Object.entries(params ?? {})) if (value !== undefined) url.searchParams.set(key, String(value));
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: authorization,
          Accept: 'application/json',
          'User-Agent': 'team-team-report-mcp',
          ...(body !== undefined && { 'Content-Type': 'application/json', 'X-Atlassian-Token': 'no-check' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new JiraError(0, ['Não foi possível falar com o Jira.']);
    }
    if (!response.ok) throw new JiraError(response.status, await readMessages(response));
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  const client: JiraClient = {
    get: (path, params) => request('GET', path, params),
    post: (path, body, params) => request('POST', path, params, body),
    myself: () => (me ??= request('GET', 'rest/api/3/myself')),
    async describe(error) {
      if (!(error instanceof JiraError)) return error instanceof Error ? error.message : 'Erro inesperado.';
      const reason = error.details.length ? ` Resposta do Jira: "${error.details.join(' ')}"` : '';
      switch (error.status) {
        case 401: {
          // 401 é token recusado (expirou, foi revogado) ou token sem o escopo desta ação: o /myself separa.
          let alive: boolean | null = null;
          try {
            await request('GET', 'rest/api/3/myself');
            alive = true;
          } catch (check) {
            alive = check instanceof JiraError && check.status === 401 ? false : null;
          }
          if (alive === false) {
            return 'O Jira não aceita o token do header Authorization: ele expirou, foi revogado, ou o e-mail não confere. Gere um token novo e instale o MCP de novo pelas Configurações do Team Reports.';
          }
          return `O token não tem o escopo que esta ação pede no Jira (para escrever: write:jira-work).${reason}`;
        }
        case 403:
          return `O Jira recusou: a conta não tem permissão para isso.${reason}`;
        case 404:
          return `Não encontrado no Jira (a issue não existe ou a conta não tem acesso a ela).${reason}`;
        case 429:
          return 'O Jira recusou por excesso de requisições. Tente de novo em instantes.';
        case 0:
          return error.message;
        default:
          return `O Jira recusou (${error.status}).${reason}`;
      }
    },
  };
  return client;
}
