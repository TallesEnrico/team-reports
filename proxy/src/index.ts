import { allowedOrigins, type Env, jiraApiBase } from './env';
import { handleMcp, isMcpPath } from './mcp/server';
import { handleAtlassianAuth, isAtlassianAuthPath } from './oauth/atlassian';
import { handleTenantInfo, isTenantInfoPath } from './tenantInfo';

/**
 * Backend do team-report (Cloudflare Worker), com três portas que não se misturam:
 * - `/auth/atlassian`: só o OAuth 2.0 da Atlassian (o `client_secret` fica aqui). Não encaminha a API do Jira;
 * - `/mcp`: o servidor MCP (ver `src/mcp/server.ts`), exclusivo dos clientes MCP
 *   (Codex, Cursor, Antigravity, Claude, Copilot); o app nunca chama esse caminho;
 * - o resto: o proxy de escritas do app, descrito abaixo.
 *
 * Proxy de escritas do team-report.
 *
 * O Jira Cloud recusa POST vindo do navegador de outra origem ("XSRF check
 * failed"), mesmo com `X-Atlassian-Token: no-check`: esse cabeçalho só vale
 * para chamadas de fora do navegador. Este Worker refaz o POST do lado do
 * servidor, sem a origem nem o User-Agent do navegador.
 *
 * O mínimo possível:
 * - só POST, e só nos caminhos de `ALLOWED_PATHS` (não é um proxy aberto);
 * - só para as origens em `ALLOWED_ORIGINS`, no cloud ID do header `X-Jira-Cloud-Id` (ou `JIRA_CLOUD_ID`);
 * - o token de cada pessoa só passa (cabeçalho `Authorization`): nada é guardado nem registrado.
 */

/** As escritas que o app faz por POST: trocar status, lançar horas e criar issues (subtarefas e issues de épico). */
const ALLOWED_PATHS = [
  /^\/rest\/api\/3\/issue\/[A-Za-z0-9-]+\/transitions$/,
  /^\/rest\/api\/3\/issue\/[A-Za-z0-9-]+\/worklog$/,
  /^\/rest\/api\/3\/issue$/,
];

const CLOUD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function corsHeaders(origin: string): Record<string, string> {
  return {
    // Ecoa a origem: o navegador precisa disso para ler até as respostas de erro do proxy.
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-Atlassian-Token, X-Jira-Cloud-Id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function resolveCloudId(request: Request, env: Env): string | null {
  const fromClient = request.headers.get('X-Jira-Cloud-Id')?.trim() ?? '';
  if (!fromClient) return env.JIRA_CLOUD_ID;
  return CLOUD_ID.test(fromClient) ? fromClient.toLowerCase() : null;
}

/** Erro do próprio proxy, no formato de erro do Jira (o app mostra `errorMessages`). */
function proxyError(status: number, message: string, origin: string): Response {
  return new Response(JSON.stringify({ errorMessages: [`Proxy de escritas: ${message}`] }), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // O MCP tem regras próprias (clientes fora do navegador, autenticação no header de cada chamada).
    const url = new URL(request.url);
    if (isAtlassianAuthPath(url.pathname)) return handleAtlassianAuth(request, env);
    if (isMcpPath(url.pathname)) return handleMcp(request, env);
    const origin = request.headers.get('Origin') ?? '';
    if (isTenantInfoPath(url.pathname)) return handleTenantInfo(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

    // 421: este proxy não atende esse pedido (origem, caminho). Nada disso chegou ao Jira.
    if (!allowedOrigins(env).includes(origin)) {
      return proxyError(421, `a origem ${origin || '(nenhuma)'} não está em ALLOWED_ORIGINS.`, origin);
    }
    if (request.method !== 'POST') return proxyError(405, 'só aceita POST.', origin);
    const { pathname } = url;
    if (!ALLOWED_PATHS.some((path) => path.test(pathname))) {
      return proxyError(421, `o caminho ${pathname} não está entre as escritas liberadas.`, origin);
    }
    const authorization = request.headers.get('Authorization');
    if (!authorization) return proxyError(401, 'falta o cabeçalho Authorization.', origin);
    const cloudId = resolveCloudId(request, env);
    if (!cloudId) return proxyError(421, 'o cloud ID informado não é válido.', origin);

    let upstream: Response;
    try {
      // Requisição nova: sem a origem nem o User-Agent do navegador, que fazem o Jira barrar o POST.
      upstream = await fetch(`${jiraApiBase({ ...env, JIRA_CLOUD_ID: cloudId })}${pathname}`, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Atlassian-Token': 'no-check',
          'User-Agent': 'team-report-proxy',
        },
        body: await request.text(),
      });
    } catch {
      return proxyError(502, 'não foi possível falar com o Jira.', origin);
    }

    const headers = new Headers(corsHeaders(origin));
    const contentType = upstream.headers.get('Content-Type');
    if (contentType) headers.set('Content-Type', contentType);
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
