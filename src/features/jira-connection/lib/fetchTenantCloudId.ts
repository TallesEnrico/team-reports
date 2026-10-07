import { JIRA_WRITE_PROXY_URL } from '@/api/jira-config';
import { normalizeJiraDomain, parseCloudId, tenantInfoUrl } from './validateJiraSite';

const TENANT_PATH = '/__tenant_info';

type Lookup = { status: 'hit'; cloudId: string } | { status: 'miss' } | { status: 'unavailable' };

function cloudIdFrom(body: unknown): string | null | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  if (!('cloudId' in record) && !('clientId' in record) && !('clientID' in record)) return undefined;
  const raw = record.cloudId ?? record.clientId ?? record.clientID;
  return typeof raw === 'string' ? parseCloudId(raw) : null;
}

async function lookup(url: string, signal?: AbortSignal): Promise<Lookup> {
  if (signal?.aborted) return { status: 'unavailable' };
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  } catch {
    return { status: 'unavailable' };
  }
  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.includes('json')) return { status: 'unavailable' };
  try {
    const cloudId = cloudIdFrom(await response.json());
    if (cloudId === undefined) return { status: 'unavailable' };
    return cloudId ? { status: 'hit', cloudId } : { status: 'miss' };
  } catch {
    return { status: 'unavailable' };
  }
}

function proxyLookupUrl(query: string): string | null {
  if (!JIRA_WRITE_PROXY_URL) return null;
  let proxyOrigin: string;
  try {
    proxyOrigin = new URL(JIRA_WRITE_PROXY_URL).origin;
  } catch {
    return null;
  }
  if (typeof window !== 'undefined' && proxyOrigin === window.location.origin) return null;
  return `${JIRA_WRITE_PROXY_URL}${query}`;
}

export async function fetchTenantCloudId(domain: string, signal?: AbortSignal): Promise<string | null> {
  const normalized = normalizeJiraDomain(domain);
  const direct = tenantInfoUrl(normalized);
  if (!direct) return null;

  const query = `${TENANT_PATH}?domain=${encodeURIComponent(normalized)}`;
  const attempts = [query, proxyLookupUrl(query), direct].filter((url): url is string => url !== null);

  for (const url of attempts) {
    if (signal?.aborted) return null;
    const result = await lookup(url, signal);
    if (result.status === 'hit') return result.cloudId;
    if (result.status === 'miss') return null;
  }
  return null;
}
