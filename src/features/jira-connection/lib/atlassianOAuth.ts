import { requestJira } from '@/api/jira-client';
import { fetchSquads } from '@/features/jira-connection/api/connection-api';
import { normalizeJiraDomain } from '@/features/jira-connection/lib/validateJiraSite';
import { useJiraConnectionStore, type JiraCredentials } from '@/store/useJiraConnectionStore';
import { saveOAuthPending, type OAuthSite } from '@/features/jira-connection/lib/oauthPending';

export const ATLASSIAN_LOGIN_PATH = '/auth/atlassian/start';

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  denied: 'A autorização na Atlassian foi cancelada.',
  state: 'O login expirou ou foi aberto em outro lugar. Tente de novo.',
  cookie: 'O navegador não guardou o login. Entre de novo com a Atlassian.',
  exchange: 'A Atlassian não concluiu o login. Tente de novo.',
  site: 'Nenhum site do Jira foi autorizado para o Team Reportss.',
  config: 'O login com Atlassian ainda não está configurado neste servidor.',
};

export type OAuthReturn = { kind: 'sealed'; sealed: string } | { kind: 'error'; code: string };

interface OAuthGrant {
  accessToken: string;
  expiresIn: number;
  sites: OAuthSite[];
}

let captured: OAuthReturn | null | undefined;
let acceptTask: Promise<void> | null = null;

export function oauthErrorMessage(code: string): string {
  return OAUTH_ERROR_MESSAGES[code] ?? 'Não foi possível concluir o login com a Atlassian.';
}

export async function startAtlassianLogin(): Promise<void> {
  let response: Response;
  try {
    response = await fetch(ATLASSIAN_LOGIN_PATH, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'X-App-Origin': window.location.origin },
    });
  } catch {
    throw new Error('Não foi possível iniciar o login com a Atlassian.');
  }
  if (!response.ok) throw new Error('Não foi possível iniciar o login com a Atlassian.');
  const body = (await response.json()) as { url?: unknown };
  if (typeof body.url !== 'string' || !body.url.startsWith('https://auth.atlassian.com/authorize?')) {
    throw new Error('Não foi possível iniciar o login com a Atlassian.');
  }
  window.location.assign(body.url);
}

export function captureOAuthReturn(location: Location = window.location, history: History = window.history): OAuthReturn | null {
  if (captured !== undefined) return captured;
  captured = takeOAuthReturn(location, history);
  return captured;
}

function oauthQuery(location: Location): URLSearchParams | null {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/oauth/callback') return new URLSearchParams(location.search);
  const hash = location.hash;
  if (!hash.startsWith('#/oauth/callback')) return null;
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(query);
}

function takeOAuthReturn(location: Location, history: History): OAuthReturn | null {
  const params = oauthQuery(location);
  if (!params) return null;
  const sealed = params.get('h');
  const error = params.get('error');
  history.replaceState(history.state, '', '/');
  if (sealed && /^[A-Za-z0-9_-]{20,16000}$/.test(sealed)) return { kind: 'sealed', sealed };
  if (error && error in OAUTH_ERROR_MESSAGES) return { kind: 'error', code: error };
  return { kind: 'error', code: 'exchange' };
}

export function clearAtlassianOAuthCookie(): void {
  void fetch('/auth/atlassian/logout', { method: 'POST', credentials: 'same-origin', keepalive: true }).catch(() => undefined);
}

async function redeemAtlassianHandoff(sealed: string): Promise<OAuthGrant> {
  let response: Response;
  try {
    response = await fetch('/auth/atlassian/handoff', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ h: sealed }),
    });
  } catch {
    throw new Error('Não foi possível concluir o login com a Atlassian.');
  }
  if (!response.ok) {
    let message = 'Não foi possível concluir o login com a Atlassian.';
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === 'string' && body.message.length < 200) message = body.message;
    } catch {
      throw new Error('Não foi possível concluir o login com a Atlassian.');
    }
    throw new Error(message);
  }
  const body = (await response.json()) as { accessToken?: unknown; expiresIn?: unknown; sites?: unknown };
  if (typeof body.accessToken !== 'string' || typeof body.expiresIn !== 'number' || !Array.isArray(body.sites)) {
    throw new Error('A Atlassian não devolveu o acesso do Jira.');
  }
  const sites: OAuthSite[] = [];
  for (const item of body.sites) {
    if (!item || typeof item !== 'object') continue;
    const site = item as { cloudId?: unknown; url?: unknown; name?: unknown };
    if (typeof site.cloudId !== 'string' || typeof site.url !== 'string' || typeof site.name !== 'string') continue;
    const domain = normalizeJiraDomain(site.url);
    if (!domain) continue;
    sites.push({ cloudId: site.cloudId, url: site.url, name: site.name, domain });
  }
  if (sites.length === 0) throw new Error('Nenhum site do Jira foi autorizado para o Team Reportss.');
  return { accessToken: body.accessToken, expiresIn: body.expiresIn, sites };
}

async function acceptOnce(sealed: string): Promise<void> {
  const grant = await redeemAtlassianHandoff(sealed);
  const existing = useJiraConnectionStore.getState().credentials;
  const site = grant.sites.find((item) => item.cloudId === existing?.cloudId) ?? grant.sites[0];
  if (!site) throw new Error('Nenhum site do Jira foi autorizado para o Team Reportss.');
  const expiresAt = Date.now() + grant.expiresIn * 1000 - 30_000;
  const auth = { email: existing?.email || 'oauth', token: grant.accessToken, authMethod: 'oauth' as const, expiresAt };
  let email = existing?.email || '';
  let accountId = email;
  let displayName = email;
  try {
    const profile = await requestJira<{ accountId: string; displayName?: string; emailAddress?: string }>('rest/api/3/myself', {
      auth,
      cloudId: site.cloudId,
    });
    accountId = profile.accountId;
    email = profile.emailAddress?.trim() || existing?.email || profile.accountId;
    displayName = profile.displayName?.trim() || email;
  } catch (cause) {
    if (!existing?.squad || !existing.email) throw cause instanceof Error ? cause : new Error('A Atlassian não devolveu a conta do Jira.');
    email = existing.email;
    accountId = existing.email;
    displayName = existing.email;
  }
  const connection = (squad: string): JiraCredentials => ({
    email,
    token: grant.accessToken,
    squad,
    cloudId: site.cloudId,
    domain: site.domain,
    authMethod: 'oauth',
    expiresAt,
  });
  if (existing?.squad) {
    await useJiraConnectionStore.getState().connect(connection(existing.squad));
    return;
  }
  try {
    const squads = await fetchSquads({ ...auth, email, cloudId: site.cloudId });
    if (squads.length === 1) {
      await useJiraConnectionStore.getState().connect(connection(squads[0].key));
      return;
    }
  } catch {
    await saveOAuthPending({ accessToken: grant.accessToken, expiresAt, email, accountId, displayName, sites: grant.sites });
    return;
  }
  await saveOAuthPending({ accessToken: grant.accessToken, expiresAt, email, accountId, displayName, sites: grant.sites });
}

export function acceptAtlassianLogin(sealed: string): Promise<void> {
  acceptTask ??= acceptOnce(sealed);
  return acceptTask;
}
