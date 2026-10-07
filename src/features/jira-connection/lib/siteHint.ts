import { normalizeJiraDomain, tenantInfoUrl } from './validateJiraSite';

export interface SiteLocation {
  hostname: string;
  search: string;
  hash: string;
}

const TWO_LEVEL_SUFFIX = new Set(['com.br', 'net.br', 'org.br', 'co.uk', 'com.au', 'co.nz']);

function asDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = normalizeJiraDomain(decodeURIComponent(value));
  return tenantInfoUrl(normalized) ? normalized : null;
}

function queryDomain(search: string): string | null {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  return asDomain(new URLSearchParams(raw).get('dominio'));
}

function readSubdomain(hostname: string): string | null {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost') return null;
  if (host.endsWith('.localhost')) {
    const label = host.slice(0, -'.localhost'.length).split('.').at(-1) ?? '';
    return asDomain(label);
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return null;

  const labels = host.split('.');
  const suffix = labels.slice(-2).join('.');
  const siteLabels = TWO_LEVEL_SUFFIX.has(suffix) ? 3 : 2;
  if (labels.length <= siteLabels || labels[0] === 'www') return null;
  return asDomain(labels[0]);
}

export function readSiteDomain(location: SiteLocation): string | null {
  const fromSearch = queryDomain(location.search);
  if (fromSearch) return fromSearch;

  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?')) : '';
  const fromHash = queryDomain(hashQuery);
  if (fromHash) return fromHash;

  return readSubdomain(location.hostname);
}

export function clearSiteDomainHint(href = window.location.href): string | null {
  const url = new URL(href);
  let changed = false;
  if (url.searchParams.has('dominio')) {
    url.searchParams.delete('dominio');
    changed = true;
  }
  const hashBody = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const queryAt = hashBody.indexOf('?');
  if (queryAt >= 0) {
    const params = new URLSearchParams(hashBody.slice(queryAt + 1));
    if (params.has('dominio')) {
      params.delete('dominio');
      const rest = params.toString();
      const path = hashBody.slice(0, queryAt);
      url.hash = rest ? `${path}?${rest}` : path;
      changed = true;
    }
  }
  if (!changed) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function forgetSiteDomainHint(): void {
  const next = clearSiteDomainHint();
  if (next) window.history.replaceState(window.history.state, '', next);
}

export function siteLinkWithDomain(domain: string, href: string): string {
  const normalized = normalizeJiraDomain(domain);
  const current = new URL(href);
  const url = new URL(`${current.origin}/`);
  url.searchParams.set('dominio', normalized);
  return url.toString();
}
