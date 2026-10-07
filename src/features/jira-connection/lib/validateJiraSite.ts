const DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const CLOUD_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function normalizeJiraDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.atlassian\.net$/, '');
}

export function isJiraDomainName(value: string): boolean {
  return DOMAIN.test(normalizeJiraDomain(value));
}

export function tenantInfoUrl(domain: string): string | null {
  const normalized = normalizeJiraDomain(domain);
  if (!DOMAIN.test(normalized)) return null;
  return `https://${normalized}.atlassian.net/_edge/tenant_info`;
}

export function parseCloudId(value: string): string | null {
  return value.match(CLOUD_ID)?.[0].toLowerCase() ?? null;
}

export function validateJiraSite(domain: string, cloudId: string): string | null {
  const normalized = normalizeJiraDomain(domain);
  if (!normalized) return 'Informe o domínio do site do Jira.';
  if (!DOMAIN.test(normalized)) return 'Domínio inválido. Use o nome antes de .atlassian.net, como empresa.';
  if (!parseCloudId(cloudId)) return 'Cloud ID inválido. Abra a página indicada e copie o cloudId.';
  return null;
}
