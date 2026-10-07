/**
 * Site usado por contas salvas antes do cadastro pedir domínio e cloud ID.
 * Contas novas usam o que a pessoa informa no assistente.
 */
export const JIRA_SITE_DOMAIN = 'teamreports';

/** Site do Jira: links de issue e ícones públicos. */
export const JIRA_SITE_URL = `https://${JIRA_SITE_DOMAIN}.atlassian.net`;

/** Cloud ID do site padrão (ver `https://{domínio}.atlassian.net/_edge/tenant_info`). */
export const JIRA_CLOUD_ID = '2bc8dd13-1765-447e-910f-36bc5a93fdb1';

/**
 * API via gateway da Atlassian. Diferente do endereço do site, o gateway
 * responde com CORS liberado, então o navegador chama a API direto. É também o
 * endereço exigido pelos tokens de API com escopo.
 */
export function jiraApiBaseUrl(cloudId: string): string {
  return `https://api.atlassian.com/ex/jira/${cloudId}`;
}

export const JIRA_API_BASE_URL = jiraApiBaseUrl(JIRA_CLOUD_ID);

/**
 * Proxy de escritas (`proxy/`, um Cloudflare Worker), a única peça fora do
 * navegador. O Jira Cloud recusa POST vindo do navegador ("XSRF check failed",
 * mesmo com `X-Atlassian-Token: no-check`); o proxy refaz só esses POST (trocar
 * status, lançar horas, criar issues) do lado do servidor. Leituras e PUT
 * continuam indo direto ao gateway. O token só passa pelo proxy: nada é guardado.
 *
 * Vem de `VITE_JIRA_WRITE_PROXY_URL` (um endereço, não um segredo). Sem ele, os
 * POST vão direto e o Jira os recusa (o lançamento de horas cai para a edição da issue, por PUT).
 */
export const JIRA_WRITE_PROXY_URL = import.meta.env.VITE_JIRA_WRITE_PROXY_URL?.trim().replace(/\/+$/, '') || undefined;

const PUBLISHED_APEX = 'teamreports.com.br';
const JIRA_DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function publishedTenant(hostname: string): string | null {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  const suffix = `.${PUBLISHED_APEX}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  if (!label || label.includes('.') || label === 'www' || !JIRA_DOMAIN.test(label)) return null;
  return label;
}

/**
 * Servidor MCP no mesmo host do app (`/mcp`). No domínio publicado, o subdomínio
 * da página ou o da conta Jira entra no endereço (`https://empresa.teamreports.com.br/mcp`).
 * `VITE_MCP_URL` cobre o túnel e o Worker local.
 */
export function mcpUrl(jiraDomain?: string | null): string {
  const configured = import.meta.env.VITE_MCP_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (typeof window === 'undefined') return `https://${PUBLISHED_APEX}/mcp`;

  const host = window.location.hostname;
  if (host === PUBLISHED_APEX || host.endsWith(`.${PUBLISHED_APEX}`)) {
    const fromAccount = jiraDomain?.trim().toLowerCase();
    const tenant = publishedTenant(host) || (fromAccount && JIRA_DOMAIN.test(fromAccount) ? fromAccount : null);
    return tenant ? `https://${tenant}.${PUBLISHED_APEX}/mcp` : `https://${PUBLISHED_APEX}/mcp`;
  }
  return `${window.location.origin}/mcp`;
}
