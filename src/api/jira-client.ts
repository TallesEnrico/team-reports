import { type JiraCredentials, useJiraConnectionStore } from '../store/useJiraConnectionStore';
import { JIRA_CLOUD_ID, JIRA_SITE_URL, JIRA_WRITE_PROXY_URL, jiraApiBaseUrl } from './jira-config';
import { pendingJiraWriteDone, rememberPendingJiraWrite, takePendingJiraWrites } from './pendingJiraWrite';

// O navegador chama o gateway da Atlassian direto (CORS liberado; ver
// jira-config.ts), autenticando com a conta conectada, cifrada no IndexedDB.
// Só os POST vão pelo proxy de escritas, quando configurado.

export type JiraAuth = Pick<JiraCredentials, 'email' | 'token' | 'authMethod' | 'expiresAt'>;

type QueryParams = Record<string, string | number | boolean | undefined>;

interface JiraErrorBody {
  errorMessages?: string[];
  errors?: Record<string, string>;
  message?: string;
}

/**
 * Por que o Jira recusou o acesso. `token-rejected`: o token não vale mais
 * (expirou ou foi revogado); `missing-scope`: o token vale, mas não tem o escopo
 * desta chamada (ex: `write:jira-work`); `forbidden`: a conta não tem permissão.
 */
export type JiraAccessProblem = 'token-rejected' | 'missing-scope' | 'forbidden';

export class JiraApiError extends Error {
  readonly status: number;
  readonly messages: string[];
  /**
   * O que o Jira respondeu, como veio. Em 401/403, `messages` traz a orientação
   * do app; aqui fica o motivo do Jira (ex: falta de permissão na issue).
   */
  readonly details: string[];
  /** Em 401/403, o motivo da recusa. */
  readonly accessProblem?: JiraAccessProblem;

  constructor(status: number, messages: string[], details: string[] = messages, accessProblem?: JiraAccessProblem) {
    super(messages[0] ?? `Erro na requisição ao Jira (${status})`);
    this.name = 'JiraApiError';
    this.status = status;
    this.messages = messages;
    this.details = details;
    this.accessProblem = accessProblem;
  }
}

export const TOKEN_REJECTED_MESSAGE =
  'O Jira não aceita mais o token desta conta: ele expirou ou foi revogado na Atlassian. Crie um token novo e use "Conectar de novo", no rodapé da lateral.';

export const OAUTH_REJECTED_MESSAGE =
  'O acesso da Atlassian expirou ou foi revogado. Entre de novo com a Atlassian para continuar.';

function rejectedMessage(auth: JiraAuth): string {
  return auth.authMethod === 'oauth' ? OAUTH_REJECTED_MESSAGE : TOKEN_REJECTED_MESSAGE;
}

/**
 * O token conectado não vale mais (expirou ou foi revogado). As telas mostram
 * `error.message` (a orientação para conectar um token novo) no lugar das suas
 * mensagens de escopo ou de permissão.
 */
export function isTokenRejected(error: unknown): boolean {
  return error instanceof JiraApiError && error.accessProblem === 'token-rejected';
}

/**
 * O Jira Cloud recusa POST com User-Agent de navegador vindo de outra origem
 * ("XSRF check failed"), mesmo com `X-Atlassian-Token: no-check`; o navegador
 * não deixa trocar nem o User-Agent nem a origem. PUT não passa por esse check.
 */
export function isXsrfRejection(error: unknown): boolean {
  return error instanceof JiraApiError && error.status === 403 && error.details.some((message) => /xsrf/i.test(message));
}

/** Motivo do Jira para quem recusou uma escrita, para juntar à orientação da tela (`Resposta do Jira: "…"`). */
export function jiraReason(error: JiraApiError): string {
  return error.details.length > 0 ? ` Resposta do Jira: "${error.details.join(' ')}"` : '';
}

function buildUrl(baseUrl: string, path: string, params?: QueryParams): string {
  const url = `${baseUrl}/${path.replace(/^\//, '')}`;
  if (!params) return url;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${url}?${query}` : url;
}

/** Corpo de erro do Jira (JSON ou texto cru, como o "Unauthorized; scope does not match" do gateway). */
async function readJiraMessages(response: Response): Promise<string[]> {
  let text: string;
  try {
    text = (await response.text()).trim();
  } catch {
    return [];
  }
  if (!text) return [];
  try {
    const body = JSON.parse(text) as JiraErrorBody | string;
    // Alguns erros (ex: "XSRF check failed") vêm como uma string JSON solta.
    if (typeof body === 'string') return [body];
    const messages = [...(body.errorMessages ?? []), ...Object.values(body.errors ?? {})];
    if (body.message) messages.push(body.message);
    return messages;
  } catch {
    // Texto cru (não JSON), curto o bastante para mostrar.
    return [text.slice(0, 300)];
  }
}

/** Quanto tempo a conferência do token vale para as próximas recusas (várias buscas falham juntas). */
const TOKEN_CHECK_TTL_MS = 15_000;

let tokenCheck: { token: string; at: number; alive: Promise<boolean | null> } | null = null;

function resolveCloudId(explicit?: string): string {
  const fromCall = explicit?.trim();
  if (fromCall) return fromCall;
  return useJiraConnectionStore.getState().credentials?.cloudId || JIRA_CLOUD_ID;
}

function resolveSiteUrl(): string {
  const domain = useJiraConnectionStore.getState().credentials?.domain;
  return domain ? `https://${domain}.atlassian.net` : JIRA_SITE_URL;
}

/**
 * Se o Jira ainda aceita o token, pelo `GET /myself` (escopo `read:jira-user`,
 * que o assistente de conexão exige): 401 nele é token recusado. `null` quando
 * não deu para saber (sem rede, outro erro).
 */
function checkTokenAlive(auth: JiraAuth, cloudId: string): Promise<boolean | null> {
  if (tokenCheck && tokenCheck.token === auth.token && Date.now() - tokenCheck.at < TOKEN_CHECK_TTL_MS) {
    return tokenCheck.alive;
  }
  const alive = fetch(buildUrl(jiraApiBaseUrl(cloudId), 'rest/api/3/myself'), {
    headers: { Accept: 'application/json', Authorization: jiraAuthorization(auth) },
  })
    .then((response) => (response.status === 401 ? false : response.ok ? true : null))
    .catch(() => null);
  tokenCheck = { token: auth.token, at: Date.now(), alive };
  return alive;
}

/**
 * Erro de uma resposta do Jira. O gateway responde 401 tanto para token que não
 * vale mais (expirado, revogado) quanto para token sem o escopo da chamada
 * ("Unauthorized; scope does not match"): `tokenAlive` (a conferência pelo
 * `/myself`) separa os dois. A orientação vai em `messages`; o que o Jira disse, em `details`.
 */
function toApiError(response: Response, details: string[], tokenAlive: boolean | null | undefined, auth: JiraAuth): JiraApiError {
  if (response.status === 401) {
    if (tokenAlive === false) return new JiraApiError(401, [rejectedMessage(auth)], details, 'token-rejected');
    if (tokenAlive === true) {
      const message = 'O token conectado não tem o escopo que esta ação pede no Jira. Crie um token com os escopos listados no assistente de conexão e use "Sair" para conectar com ele.';
      return new JiraApiError(401, [message], details, 'missing-scope');
    }
    // Sem a conferência (ex: credenciais do assistente), os dois motivos possíveis.
    const message = 'Acesso negado pelo Jira: o e-mail e o token não conferem, o token expirou ou foi revogado, ou ele não tem o escopo desta ação.';
    return new JiraApiError(401, [message], details);
  }
  if (response.status === 403) {
    const message = 'O Jira recusou o acesso: a conta conectada não tem permissão para isso.';
    return new JiraApiError(403, [message], details, 'forbidden');
  }
  const messages = details.length > 0 ? details : [`Erro na requisição ao Jira: ${response.status} ${response.statusText}`];
  return new JiraApiError(response.status, messages, details);
}

export interface JiraRequestOptions {
  method?: 'GET' | 'POST' | 'PUT';
  data?: unknown;
  params?: QueryParams;
  signal?: AbortSignal;
  /** Credenciais explícitas (ex: validação no assistente de conexão); por padrão, as da conta conectada. */
  auth?: JiraAuth;
  /** Cloud ID do site, quando a conta ainda não está salva (assistente de conexão). */
  cloudId?: string;
  remember?: boolean;
}

/** Valor do header `Authorization` do Jira: `Basic base64(email:token)` (também o do MCP, em Configurações). */
export function basicAuthorization({ email, token, authMethod }: JiraAuth): string {
  if (authMethod === 'oauth') throw new Error('O acesso OAuth não usa Basic.');
  const bytes = new TextEncoder().encode(`${email}:${token}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

export function jiraAuthorization(auth: JiraAuth): string {
  if (auth.authMethod === 'oauth') return `Bearer ${auth.token}`;
  return basicAuthorization(auth);
}

/** Leituras recusadas por excesso de requisições (429) voltam a ser tentadas até esse número de vezes. */
const RATE_LIMIT_RETRIES = 3;

/** Espera pedida pelo Jira (`Retry-After`, em segundos) ou, sem ela, 1s, 2s, 4s… */
function rateLimitDelayMs(response: Response, attempt: number): number {
  const seconds = Number(response.headers.get('Retry-After'));
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds, 30) * 1000;
  return 1000 * 2 ** attempt;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function rememberWrite(path: string, options: JiraRequestOptions): void {
  const method = options.method ?? 'GET';
  if (method === 'GET' || options.remember === false || options.auth) return;
  rememberPendingJiraWrite({ method, path, data: options.data, params: options.params });
}

export async function requestJira<T>(path: string, options: JiraRequestOptions = {}): Promise<T> {
  const { method = 'GET', data, params, signal } = options;
  const connection = useJiraConnectionStore.getState();
  const auth = options.auth ?? connection.credentials;
  if (!auth) throw new JiraApiError(401, ['Conecte sua conta do Jira para continuar.'], []);
  if (auth.authMethod === 'oauth' && typeof auth.expiresAt === 'number' && auth.expiresAt <= Date.now()) {
    if (!options.auth) {
      rememberWrite(path, options);
      connection.markTokenRejected();
    }
    throw new JiraApiError(401, [OAUTH_REJECTED_MESSAGE], [], 'token-rejected');
  }
  if (auth.authMethod === 'oauth' && auth.expiresAt == null && !options.auth) {
    rememberWrite(path, options);
    connection.markTokenRejected();
    throw new JiraApiError(401, [OAUTH_REJECTED_MESSAGE], [], 'token-rejected');
  }

  const cloudId = resolveCloudId(options.cloudId);
  const headers: Record<string, string> = { Accept: 'application/json', Authorization: jiraAuthorization(auth) };
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  // Sem este cabeçalho o Jira aplica o check de XSRF a escritas vindas do navegador.
  if (method !== 'GET') headers['X-Atlassian-Token'] = 'no-check';
  // Do navegador, o Jira recusa POST mesmo com esse cabeçalho: com o proxy configurado, eles vão por ele.
  const proxyUrl = method === 'POST' ? JIRA_WRITE_PROXY_URL : undefined;
  if (proxyUrl) headers['X-Jira-Cloud-Id'] = cloudId;
  const url = buildUrl(proxyUrl ?? jiraApiBaseUrl(cloudId), path, params);

  let response: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await fetch(url, {
        method,
        headers,
        body: data === undefined ? undefined : JSON.stringify(data),
        signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      const message = proxyUrl
        ? `Não foi possível conectar ao proxy de escritas (${proxyUrl}). Confira se ele está no ar.`
        : 'Não foi possível conectar ao Jira. Verifique sua conexão com a internet.';
      throw new JiraApiError(0, [message], []);
    }
    // Telas com muitas leituras (ex: Metrics) podem bater no limite do Jira; escritas não são repetidas.
    if (response.status !== 429 || method !== 'GET' || attempt >= RATE_LIMIT_RETRIES) break;
    await wait(rateLimitDelayMs(response, attempt), signal);
  }

  if (!response.ok) {
    const details = await readJiraMessages(response);
    // Com a conta conectada (não o assistente), um 401 pede a conferência do token.
    let tokenAlive: boolean | null | undefined;
    if (response.status === 401 && !options.auth) {
      tokenAlive =
        connection.tokenRejected || path.replace(/^\//, '') === 'rest/api/3/myself' ? false : await checkTokenAlive(auth, cloudId);
      if (tokenAlive === false) {
        rememberWrite(path, options);
        useJiraConnectionStore.getState().markTokenRejected();
      }
    }
    throw toApiError(response, details, tokenAlive, auth);
  }
  // Algumas escritas (ex: transição de status) respondem 204, sem corpo.
  const body = await response.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

export type ResumeResult = { tone: 'success' | 'error'; message: string };

export async function resumePendingJiraWrites(): Promise<ResumeResult | null> {
  const writes = takePendingJiraWrites();
  if (writes.length === 0) return null;
  for (let index = 0; index < writes.length; index++) {
    const write = writes[index];
    try {
      await requestJira(write.path, {
        method: write.method,
        data: write.data,
        params: write.params,
        remember: false,
      });
    } catch (error) {
      if (isTokenRejected(error)) {
        for (const rest of writes.slice(index)) rememberPendingJiraWrite(rest);
        return null;
      }
      const message = error instanceof JiraApiError ? error.message : 'Não foi possível concluir a alteração salva.';
      return { tone: 'error', message };
    }
  }
  return { tone: 'success', message: pendingJiraWriteDone(writes) };
}

export function jiraBrowseUrl(issueKey: string): string {
  return `${resolveSiteUrl()}/browse/${issueKey}`;
}

/** Perfil da conta no Jira (nome, e-mail quando visível, equipes). */
export function jiraProfileUrl(accountId: string): string {
  return `${resolveSiteUrl()}/jira/people/${encodeURIComponent(accountId)}`;
}
