import { normalizeJiraDomain, parseCloudId, validateJiraSite } from './validateJiraSite';

export interface SiteShare {
  domain: string;
  clientId: string;
}

export function formatSiteShare(domain: string, clientId: string): string {
  return JSON.stringify({ domain, clientId }, null, 2);
}

export function parseSiteShare(text: string): { ok: true; site: SiteShare } | { ok: false; error: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Esse texto não é um JSON. Cole o JSON do site, com domain e clientId.' };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'O JSON precisa ser um objeto com domain e clientId.' };
  }
  const record = value as Record<string, unknown>;
  const domainRaw = record.domain ?? record.dominio;
  const clientRaw = record.clientId ?? record.clientID ?? record.cloudId ?? record.cloudID;
  if (typeof domainRaw !== 'string' || typeof clientRaw !== 'string') {
    return { ok: false, error: 'O JSON precisa ter domain e clientId.' };
  }
  const problem = validateJiraSite(domainRaw, clientRaw);
  if (problem) return { ok: false, error: problem };
  const clientId = parseCloudId(clientRaw);
  if (!clientId) return { ok: false, error: 'Cloud ID inválido. Abra a página indicada e copie o cloudId.' };
  return { ok: true, site: { domain: normalizeJiraDomain(domainRaw), clientId } };
}
