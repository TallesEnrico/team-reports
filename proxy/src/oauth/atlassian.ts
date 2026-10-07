import type { Env } from '../env';
import { allowedOrigins } from '../env';
import { codeChallenge, openJson, randomUrlSafe, readPayload, sealJson, signPayload } from './crypto';

const AUTHORIZE_URL = 'https://auth.atlassian.com/authorize';
const TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';
const COOKIE = 'team_oauth';
const STATE_PURPOSE = 'team-oauth-state';
const COOKIE_PURPOSE = 'team-oauth-cookie';
const STATE_TTL_SECONDS = 10 * 60;
const HANDOFF_TTL_SECONDS = 2 * 60;
const SCOPES = [
  'read:jira-user',
  'read:jira-work',
  'write:jira-work',
  'read:project:jira',
  'read:board-scope:jira-software',
  'read:board-scope.admin:jira-software',
  'offline_access',
];

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  origin: string;
}

interface StatePayload {
  n: string;
  e: number;
  o: string;
}

interface CookiePayload {
  n: string;
  v: string;
  e: number;
  o: string;
}

interface SealBody {
  t: string;
  r: string;
  x: number;
  e: number;
  o: string;
  s: { id: string; url: string; name: string }[];
}

interface TokenGrant {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface AccessibleResource {
  id?: unknown;
  url?: unknown;
  name?: unknown;
  scopes?: unknown;
}

const CLOUD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAtlassianAuthPath(pathname: string): boolean {
  return (
    pathname === '/auth/atlassian/start' ||
    pathname === '/auth/atlassian/callback' ||
    pathname === '/auth/atlassian/handoff' ||
    pathname === '/auth/atlassian/refresh' ||
    pathname === '/auth/atlassian/logout'
  );
}

function oauthConfig(env: Env): OAuthConfig | null {
  const clientId = env.ATLASSIAN_CLIENT_ID?.trim() ?? '';
  const clientSecret = env.ATLASSIAN_CLIENT_SECRET?.trim() ?? '';
  const redirectUri = env.ATLASSIAN_REDIRECT_URI?.trim() ?? '';
  if (!clientId || !clientSecret || !redirectUri) return null;
  try {
    const url = new URL(redirectUri);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password || url.hash) return null;
    if (url.origin === 'null') return null;
    return { clientId, clientSecret, redirectUri, origin: url.origin };
  } catch {
    return null;
  }
}

function appOriginAllowed(env: Env, origin: string): boolean {
  return allowedOrigins(env).includes(origin);
}

function browserOrigin(request: Request, env: Env, fallback: string): string | null {
  const hinted = request.headers.get('X-App-Origin');
  if (hinted && appOriginAllowed(env, hinted)) return hinted;
  const referer = request.headers.get('Referer');
  if (referer) {
    try {
      const origin = new URL(referer).origin;
      if (appOriginAllowed(env, origin)) return origin;
    } catch {
      return appOriginAllowed(env, fallback) ? fallback : null;
    }
  }
  return appOriginAllowed(env, fallback) ? fallback : null;
}

function callbackUrl(origin: string): string {
  return `${origin}/auth/atlassian/callback`;
}

function statePayload(value: unknown): StatePayload | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.n !== 'string' || record.n.length < 20 || typeof record.o !== 'string') return null;
  if (typeof record.e !== 'number' || !Number.isFinite(record.e)) return null;
  return { n: record.n, e: record.e, o: record.o };
}

function cookiePayload(value: unknown): CookiePayload | null {
  const state = statePayload(value);
  if (!state || !value || typeof value !== 'object') return null;
  const verifier = (value as Record<string, unknown>).v;
  if (typeof verifier !== 'string' || verifier.length < 43 || verifier.length > 128) return null;
  return { ...state, v: verifier };
}

function sealBody(value: unknown): SealBody | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.t !== 'string' || !isOpaqueToken(record.t)) return null;
  if (typeof record.r !== 'string' || !isOpaqueToken(record.r)) return null;
  if (typeof record.x !== 'number' || typeof record.e !== 'number' || typeof record.o !== 'string') return null;
  if (!Array.isArray(record.s) || record.s.length === 0 || record.s.length > 20) return null;
  const sites = [];
  for (const item of record.s) {
    if (!item || typeof item !== 'object') return null;
    const site = item as Record<string, unknown>;
    if (typeof site.id !== 'string' || !CLOUD_ID.test(site.id)) return null;
    if (typeof site.url !== 'string' || typeof site.name !== 'string') return null;
    sites.push({ id: site.id.toLowerCase(), url: site.url, name: site.name });
  }
  return { t: record.t, r: record.r, x: record.x, e: record.e, o: record.o, s: sites };
}

function isOpaqueToken(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 20 && value.length <= 8192 && !/[\s\u0000-\u001f\u007f]/.test(value);
}

function readTokenGrant(value: unknown): TokenGrant | null {
  if (!value || typeof value !== 'object') return null;
  const token = value as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; token_type?: unknown };
  if (!isOpaqueToken(token.access_token) || !isOpaqueToken(token.refresh_token)) return null;
  if (token.token_type !== undefined && token.token_type !== 'Bearer') return null;
  const expiresIn = typeof token.expires_in === 'number' && token.expires_in > 0 && token.expires_in <= 86_400 ? token.expires_in : 3600;
  return { accessToken: token.access_token, refreshToken: token.refresh_token, expiresIn };
}

async function exchangeToken(config: OAuthConfig, body: Record<string, string>): Promise<TokenGrant | 'rejected' | 'failed'> {
  try {
    const tokenResponse = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, ...body }),
      signal: AbortSignal.timeout(15_000),
    });
    if (tokenResponse.status === 400 || tokenResponse.status === 401 || tokenResponse.status === 403) return 'rejected';
    if (!tokenResponse.ok) return 'failed';
    return readTokenGrant(await tokenResponse.json()) ?? 'failed';
  } catch {
    return 'failed';
  }
}

function readCookie(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === COOKIE) return part.slice(separator + 1).trim();
  }
  return null;
}

function cookie(value: string, maxAge: number, secure: boolean): string {
  const parts = [`${COOKIE}=${value}`, 'Path=/auth/atlassian', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function secureCookie(origin: string): boolean {
  return origin.startsWith('https://') || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
}

function page(target: string, clear?: string): Response {
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'",
    'X-Content-Type-Options': 'nosniff',
  });
  if (clear) headers.append('Set-Cookie', clear);
  const body = `<!doctype html><meta charset="utf-8"><title>Team Reportss</title><script>location.replace(${JSON.stringify(target)})</script>`;
  return new Response(body, { status: 200, headers });
}

function configError(): Response {
  return new Response('O login com Atlassian não está configurado neste servidor.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function returnTarget(origin: string, error: string): string {
  return `${origin}/oauth/callback?error=${error}`;
}

function jsonError(status: number, message: string, origin: string, clear?: string): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  });
  if (clear) headers.append('Set-Cookie', clear);
  return new Response(JSON.stringify({ message }), { status, headers });
}

function jiraSites(resources: AccessibleResource[]): { id: string; url: string; name: string }[] {
  const sites = [];
  for (const resource of resources) {
    if (typeof resource.id !== 'string' || !CLOUD_ID.test(resource.id)) continue;
    if (typeof resource.url !== 'string' || typeof resource.name !== 'string') continue;
    const scopes = Array.isArray(resource.scopes) ? resource.scopes.filter((scope) => typeof scope === 'string') : [];
    const jira = scopes.some((scope) => scope.includes('jira'));
    if (scopes.length > 0 && !jira) continue;
    sites.push({
      id: resource.id.toLowerCase(),
      url: resource.url.slice(0, 200),
      name: resource.name.slice(0, 120),
    });
  }
  return sites;
}

export async function handleAtlassianAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const config = oauthConfig(env);
  if (!config || !appOriginAllowed(env, config.origin)) return configError();

  if (url.pathname === '/auth/atlassian/start') {
    if (request.method !== 'GET') return new Response(null, { status: 405 });
    const origin = browserOrigin(request, env, config.origin);
    if (!origin) return configError();
    const exp = Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS;
    const nonce = randomUrlSafe();
    const verifier = randomUrlSafe();
    const state = await signPayload(config.clientSecret, STATE_PURPOSE, { n: nonce, e: exp, o: origin } satisfies StatePayload);
    const session = await signPayload(config.clientSecret, COOKIE_PURPOSE, {
      n: nonce,
      v: verifier,
      e: exp,
      o: origin,
    } satisfies CookiePayload);
    const authorize = new URL(AUTHORIZE_URL);
    authorize.searchParams.set('audience', 'api.atlassian.com');
    authorize.searchParams.set('client_id', config.clientId);
    authorize.searchParams.set('scope', SCOPES.join(' '));
    authorize.searchParams.set('redirect_uri', callbackUrl(origin));
    authorize.searchParams.set('state', state);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('code_challenge', await codeChallenge(verifier));
    authorize.searchParams.set('code_challenge_method', 'S256');
    const headers = new Headers({
      'Set-Cookie': cookie(session, STATE_TTL_SECONDS, secureCookie(origin)),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    });
    const authorizeUrl = authorize.toString();
    if (request.headers.get('Accept')?.includes('application/json')) {
      headers.set('Content-Type', 'application/json');
      return new Response(JSON.stringify({ url: authorizeUrl }), { status: 200, headers });
    }
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'");
    const body = `<!doctype html><meta charset="utf-8"><title>Team Reportss</title><script>location.replace(${JSON.stringify(authorizeUrl)})</script>`;
    return new Response(body, { status: 200, headers });
  }

  if (url.pathname === '/auth/atlassian/logout') {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const origin = request.headers.get('Origin') ?? '';
    if (!appOriginAllowed(env, origin)) return new Response(null, { status: 403 });
    return new Response(null, {
      status: 204,
      headers: { 'Set-Cookie': cookie('', 0, secureCookie(origin)), 'Cache-Control': 'no-store' },
    });
  }

  if (url.pathname === '/auth/atlassian/callback') {
    if (request.method !== 'GET') return new Response(null, { status: 405 });
    const state = url.searchParams.get('state') ?? '';
    const flow = await readPayload(config.clientSecret, STATE_PURPOSE, state, statePayload);
    const origin = flow && appOriginAllowed(env, flow.o) ? flow.o : config.origin;
    const failed = (error: string) => page(returnTarget(origin, error), cookie('', 0, secureCookie(origin)));
    const session = await readPayload(config.clientSecret, COOKIE_PURPOSE, readCookie(request.headers.get('Cookie')) ?? '', cookiePayload);
    const now = Math.floor(Date.now() / 1000);
    if (!flow || flow.e < now) return failed('state');
    if (!session) return failed('cookie');
    if (flow.n !== session.n || flow.o !== origin || session.o !== origin || session.e < now) return failed('state');
    if (url.searchParams.get('error')) return failed('denied');
    const code = url.searchParams.get('code') ?? '';
    if (!code || code.length > 8192) return failed('exchange');

    const grant = await exchangeToken(config, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl(origin),
      code_verifier: session.v,
    });
    if (grant === 'rejected' || grant === 'failed') return failed('exchange');
    const { accessToken, refreshToken, expiresIn } = grant;

    let sites: { id: string; url: string; name: string }[] = [];
    try {
      const resourcesResponse = await fetch(RESOURCES_URL, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!resourcesResponse.ok) return failed('site');
      const resources = (await resourcesResponse.json()) as AccessibleResource[];
      if (!Array.isArray(resources)) return failed('site');
      sites = jiraSites(resources);
    } catch {
      return failed('site');
    }
    if (sites.length === 0) return failed('site');

    const sealed = await sealJson(
      config.clientSecret,
      { t: accessToken, r: refreshToken, x: expiresIn, e: now + HANDOFF_TTL_SECONDS, o: origin, s: sites } satisfies SealBody,
      `${session.n}.${origin}`,
    );
    return page(`${origin}/oauth/callback?h=${sealed}`);
  }

  const origin = request.headers.get('Origin') ?? '';
  if (!appOriginAllowed(env, origin)) return new Response(null, { status: 403 });
  const clear = cookie('', 0, secureCookie(origin));

  if (url.pathname === '/auth/atlassian/refresh') {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type, Accept',
          'Access-Control-Max-Age': '600',
          Vary: 'Origin',
        },
      });
    }
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    let refreshToken = '';
    try {
      const body = (await request.json()) as { refreshToken?: unknown };
      if (isOpaqueToken(body.refreshToken)) refreshToken = body.refreshToken;
    } catch {
      return jsonError(400, 'Não foi possível renovar o acesso da Atlassian.', origin);
    }
    if (!refreshToken) return jsonError(400, 'Não foi possível renovar o acesso da Atlassian.', origin);
    const grant = await exchangeToken(config, { grant_type: 'refresh_token', refresh_token: refreshToken });
    if (grant === 'rejected') return jsonError(401, 'O acesso da Atlassian expirou ou foi revogado. Entre de novo com a Atlassian.', origin);
    if (grant === 'failed') return jsonError(502, 'Não foi possível renovar o acesso da Atlassian.', origin);
    return new Response(JSON.stringify({ accessToken: grant.accessToken, expiresIn: grant.expiresIn, refreshToken: grant.refreshToken }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        Vary: 'Origin',
      },
    });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      },
    });
  }

  if (request.method !== 'POST') return new Response(null, { status: 405 });
  let sealed = '';
  try {
    const body = (await request.json()) as { h?: unknown };
    if (typeof body.h === 'string') sealed = body.h;
  } catch {
    return jsonError(400, 'Não foi possível concluir o login.', origin, clear);
  }
  if (!/^[A-Za-z0-9_-]{20,48000}$/.test(sealed)) return jsonError(400, 'Não foi possível concluir o login.', origin, clear);
  const session = await readPayload(config.clientSecret, COOKIE_PURPOSE, readCookie(request.headers.get('Cookie')) ?? '', cookiePayload);
  const now = Math.floor(Date.now() / 1000);
  if (!session || session.o !== origin || session.e < now) {
    return jsonError(401, 'O login expirou. Entre de novo com a Atlassian.', origin, clear);
  }
  const opened = await openJson(config.clientSecret, sealed, `${session.n}.${origin}`, sealBody);
  if (!opened || opened.o !== origin || opened.e < now) {
    return jsonError(401, 'O login expirou. Entre de novo com a Atlassian.', origin, clear);
  }
  return new Response(JSON.stringify({ accessToken: opened.t, refreshToken: opened.r, expiresIn: opened.x, sites: opened.s.map((site) => ({ cloudId: site.id, url: site.url, name: site.name })) }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': clear,
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      Vary: 'Origin',
    },
  });
}
