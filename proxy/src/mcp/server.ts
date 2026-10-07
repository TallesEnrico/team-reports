import { allowedOrigins, type Env } from '../env';
import { createJiraClient } from './jira';
import { findTool, InputError, type ToolResult, toolDefinitions } from './tools';

/**
 * Servidor MCP do team-report, em `/mcp` (exclusivo dos clientes MCP: o app
 * nunca chama esse caminho).
 *
 * Transporte "Streamable HTTP" sem sessão: cada POST traz uma mensagem JSON-RPC
 * (ou um lote) e recebe a resposta em JSON. Não há stream (GET responde 405).
 *
 * Autenticação: o header `Authorization` de cada chamada, com as credenciais do
 * Jira de cada pessoa, como no app: `Basic base64(email:token)` (ou `Bearer
 * base64(email:token)`, para clientes que só sabem mandar Bearer). Ele só passa:
 * nada é guardado nem registrado. Sem ele, conectar e listar as ferramentas
 * funciona, e chamar uma ferramenta devolve um erro que explica como configurar
 * (um 401 faria o cliente procurar um login OAuth que não existe).
 */

function serverInfo(siteUrl: string | null): { name: string; title: string; version: string } {
  let name = 'team-report';
  if (siteUrl) {
    try {
      const domain = new URL(siteUrl).hostname.replace(/\.atlassian\.net$/i, '');
      if (domain) name = `Team Reports ${domain}`;
    } catch {
      name = 'team-report';
    }
  }
  return { name, title: name, version: '1.0.0' };
}

/** Versões do protocolo aceitas, da mais nova para a mais antiga. */
const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const MAX_BODY_BYTES = 1_000_000;

const INSTRUCTIONS = [
  'Ferramentas do Jira do Time (o mesmo do Team Reports), em nome da conta do token configurado no header Authorization.',
  'Issues pelo número com o projeto, como CLI-5151. Para listar issues, use buscar_issues (em andamento: statusCategory "In Progress"). Datas em AAAA-MM-DD e horários em HH:MM, no fuso America/Sao_Paulo se nada for dito.',
  'Horas vão nas subtarefas (ou em issues sem filhas), nunca em épicos ou issues pai. Antes de lançar horas ou mudar status, confirme com a pessoa o que vai ser gravado.',
].join(' ');

// Códigos de erro do JSON-RPC.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

type JsonRpcId = string | number | null;

interface JsonRpcMessage {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string };
}

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

export function isMcpPath(pathname: string): boolean {
  return /^\/mcp\/?$/i.test(pathname);
}

/**
 * Origens de navegador só as do app (`ALLOWED_ORIGINS`), contra páginas de terceiros
 * usando o endpoint (a especificação pede 403). Sem `Origin` (clientes fora do
 * navegador) ou com origem que não é de site (ex: `vscode-file://`), passa.
 */
function isOriginAllowed(origin: string | null, env: Env): boolean {
  if (!origin || !/^https?:\/\//i.test(origin)) return true;
  return allowedOrigins(env).includes(origin);
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  if (!origin || !allowedOrigins(env).includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-Jira-Site-Url, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function httpError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return Response.json(
    { jsonrpc: '2.0', id: null, error: { code: status === 400 ? INVALID_REQUEST : INTERNAL_ERROR, message } },
    { status, headers },
  );
}

/**
 * As credenciais do Jira do header: `Basic base64(email:token)`, como o Jira
 * espera. `Bearer base64(email:token)` vira Basic. `null` se faltam ou não têm
 * esse formato.
 */
function jiraAuthorization(header: string | null): string | null {
  const match = /^(basic|bearer)\s+([A-Za-z0-9+/=_-]+)\s*$/i.exec(header ?? '');
  if (!match) return null;
  const encoded = match[2].replace(/-/g, '+').replace(/_/g, '/');
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return null;
  }
  const separator = decoded.indexOf(':');
  if (separator <= 0 || separator === decoded.length - 1) return null;
  return `Basic ${encoded}`;
}

const MISSING_AUTH_MESSAGE =
  'Faltam as credenciais do Jira no header Authorization desta conexão MCP: "Basic " seguido de base64("seu-email@gmail.com.br:seu-token-da-api"). ' +
  'No Team Reports, em Configurações > MCP, os botões de instalação já montam esse header com o token cadastrado (ou com outro). ' +
  'Depois de corrigir a configuração, reinicie o MCP no cliente.';

function toolError(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

const SITE_URL = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.atlassian\.net$/i;

function jiraSiteUrl(header: string | null): string | null {
  const value = header?.trim().replace(/\/+$/, '') ?? '';
  return SITE_URL.test(value) ? value : null;
}

async function callTool(params: Record<string, unknown>, authorization: string | null, siteUrl: string | null, env: Env): Promise<ToolResult> {
  const name = params.name;
  if (typeof name !== 'string') throw new RpcError(INVALID_PARAMS, 'Falta o nome da ferramenta (params.name).');
  const tool = findTool(name);
  if (!tool) throw new RpcError(INVALID_PARAMS, `Ferramenta desconhecida: ${name}`);
  const args = params.arguments ?? {};
  if (typeof args !== 'object' || Array.isArray(args) || args === null) return toolError('Os argumentos precisam ser um objeto.');
  if (!authorization) return toolError(MISSING_AUTH_MESSAGE);

  const jira = createJiraClient(env, authorization);
  try {
    return await tool.run(args as Record<string, unknown>, { jira, siteUrl });
  } catch (error) {
    if (error instanceof InputError) return toolError(error.message);
    return toolError(await jira.describe(error));
  }
}

async function dispatch(message: JsonRpcMessage, authorization: string | null, siteUrl: string | null, env: Env): Promise<unknown> {
  const params = (message.params ?? {}) as Record<string, unknown>;
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    throw new RpcError(INVALID_PARAMS, 'params precisa ser um objeto.');
  }
  switch (message.method) {
    case 'initialize': {
      const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
      return {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: serverInfo(siteUrl),
        instructions: INSTRUCTIONS,
      };
    }
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: toolDefinitions() };
    case 'tools/call':
      return callTool(params, authorization, siteUrl, env);
    default:
      throw new RpcError(METHOD_NOT_FOUND, `Método não suportado: ${String(message.method)}`);
  }
}

function isValidId(id: unknown): id is string | number {
  return typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id));
}

/** Resposta de uma mensagem; `null` para notificações e respostas do cliente, que não têm resposta. */
async function handleMessage(message: unknown, authorization: string | null, siteUrl: string | null, env: Env): Promise<JsonRpcResponse | null> {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    return { jsonrpc: '2.0', id: null, error: { code: INVALID_REQUEST, message: 'Mensagem JSON-RPC inválida.' } };
  }
  const rpc = message as JsonRpcMessage;
  if (rpc.method === undefined) return null; // resposta do cliente (não pedimos nada a ele)
  if (rpc.id === undefined) return null; // notificação (initialized, cancelled…)
  if (rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string' || !isValidId(rpc.id)) {
    return { jsonrpc: '2.0', id: isValidId(rpc.id) ? rpc.id : null, error: { code: INVALID_REQUEST, message: 'Mensagem JSON-RPC inválida.' } };
  }
  try {
    return { jsonrpc: '2.0', id: rpc.id, result: await dispatch(rpc, authorization, siteUrl, env) };
  } catch (error) {
    const code = error instanceof RpcError ? error.code : INTERNAL_ERROR;
    const text = error instanceof RpcError ? error.message : 'Erro interno do servidor MCP.';
    return { jsonrpc: '2.0', id: rpc.id, error: { code, message: text } };
  }
}

export async function handleMcp(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!isOriginAllowed(origin, env)) return httpError(403, `Origem não permitida: ${origin}`);
  const cors = corsHeaders(origin, env);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  // Sem stream do servidor para o cliente e sem sessão para encerrar: só POST.
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { ...cors, Allow: 'POST, OPTIONS' } });
  }

  const version = request.headers.get('MCP-Protocol-Version');
  if (version && !SUPPORTED_VERSIONS.includes(version)) {
    return httpError(400, `Versão do protocolo MCP não suportada: ${version}. Aceitas: ${SUPPORTED_VERSIONS.join(', ')}.`, cors);
  }
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!/^application\/json\b/i.test(contentType)) return httpError(415, 'O corpo precisa ser application/json.', cors);
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) return httpError(413, 'Corpo grande demais.', cors);

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return httpError(413, 'Corpo grande demais.', cors);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: PARSE_ERROR, message: 'JSON inválido.' } }, { status: 400, headers: cors });
  }

  const authorization = jiraAuthorization(request.headers.get('Authorization'));
  const siteUrl = jiraSiteUrl(request.headers.get('X-Jira-Site-Url'));
  const messages = Array.isArray(body) ? body : [body];
  if (messages.length === 0) return httpError(400, 'Lote vazio.', cors);
  const responses = (await Promise.all(messages.map((message) => handleMessage(message, authorization, siteUrl, env)))).filter(
    (response): response is JsonRpcResponse => response !== null,
  );

  // Só notificações e respostas: 202, sem corpo.
  if (responses.length === 0) return new Response(null, { status: 202, headers: cors });
  return Response.json(Array.isArray(body) ? responses : responses[0], {
    headers: { ...cors, 'Cache-Control': 'no-store' },
  });
}
