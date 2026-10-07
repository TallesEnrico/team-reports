import { allowedOrigins, type Env } from './env';

const DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function headersFor(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    'Content-Type': 'application/json',
  };
}

function json(origin: string, status: number, cloudId: string | null): Response {
  return new Response(JSON.stringify({ cloudId }), { status, headers: headersFor(origin) });
}

export function isTenantInfoPath(pathname: string): boolean {
  return pathname === '/__tenant_info';
}

export async function handleTenantInfo(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin') ?? '';
  if (!allowedOrigins(env).includes(origin)) return json(origin, 403, null);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headersFor(origin) });
  if (request.method !== 'GET') return json(origin, 405, null);

  const domain = (new URL(request.url).searchParams.get('domain') ?? '').trim().toLowerCase();
  if (!DOMAIN.test(domain)) return json(origin, 400, null);

  try {
    const upstream = await fetch(`https://${domain}.atlassian.net/_edge/tenant_info`, {
      headers: { Accept: 'application/json' },
    });
    if (!upstream.ok) return json(origin, 404, null);
    const body = (await upstream.json()) as { cloudId?: unknown };
    const cloudId = typeof body.cloudId === 'string' ? body.cloudId : null;
    return json(origin, cloudId ? 200 : 404, cloudId);
  } catch {
    return json(origin, 502, null);
  }
}
