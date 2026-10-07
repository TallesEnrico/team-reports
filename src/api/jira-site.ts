import { useJiraConnectionStore } from '../store/useJiraConnectionStore';
import { JiraApiError } from './jira-client';
import { JIRA_CLOUD_ID, jiraApiBaseUrl } from './jira-config';

/** Endereço de um site do Jira Cloud: `https://DOMINIO.atlassian.net`. */
const SITE_URL = /^https:\/\/([a-z0-9][a-z0-9-]*)\.atlassian\.net\/?$/i;

interface ServerInfo {
  baseUrl?: string;
}

/**
 * Domínio do site do Jira (o `DOMINIO` de `https://DOMINIO.atlassian.net`), pelo
 * `baseUrl` de `GET /rest/api/3/serverInfo`. A Atlassian responde essa chamada
 * sem login; quem decide chamá-la é `useJiraSiteDomainQuery`, e só com a conta
 * conectada. `null` se o endereço não for de um site `atlassian.net`.
 */
export async function fetchJiraSiteDomain(signal?: AbortSignal): Promise<string | null> {
  let response: Response;
  try {
    const cloudId = useJiraConnectionStore.getState().credentials?.cloudId || JIRA_CLOUD_ID;
    response = await fetch(`${jiraApiBaseUrl(cloudId)}/rest/api/3/serverInfo`, { headers: { Accept: 'application/json' }, signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new JiraApiError(0, ['Não foi possível conectar ao Jira. Verifique sua conexão com a internet.'], []);
  }
  if (!response.ok) {
    throw new JiraApiError(response.status, [`Erro na requisição ao Jira: ${response.status} ${response.statusText}`], []);
  }
  const { baseUrl } = (await response.json()) as ServerInfo;
  return baseUrl?.match(SITE_URL)?.[1].toLowerCase() ?? null;
}

/** Logo do site do Jira (o logo personalizado do site): imagem pública, carrega sem token. */
export function jiraSiteLogoUrl(domain: string): string {
  return `https://${domain}.atlassian.net/jira-logo-scaled.png`;
}

export function jiraSiteFaviconUrl(domain: string): string {
  return `https://${domain}.atlassian.net/jira-favicon-scaled.png`;
}
