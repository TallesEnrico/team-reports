import { parseShareSearch, type SharedReport } from '../../team-reports/lib/shareLink';
import { validateFilters } from '../../team-reports/lib/validateFilters';
import type { Principal, ReportDisplay, ReportFilters } from '../../team-reports/types';
import { ACCOUNT_ID, MAX_REPORT_SHARE_BYTES } from './protocol';

const PROJECT_KEY = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const FIELD_ID = /^[A-Za-z0-9_.-]{1,80}$/;

function plain(value: string, max: number): string {
  return value
    .replace(/[\p{Cc}​-‏‪-‮⁦-⁩﻿]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function principal(value: Principal): Principal | null {
  if (value.type === 'current-user') return value;
  if (value.type === 'user') {
    const displayName = plain(value.displayName, 80);
    return ACCOUNT_ID.test(value.accountId) && displayName ? { type: 'user', accountId: value.accountId, displayName } : null;
  }
  const name = plain(value.name, 80);
  return ACCOUNT_ID.test(value.groupId) && name ? { type: 'group', groupId: value.groupId, name } : null;
}

export function readReportShare(search: string): SharedReport | null {
  if (search.length === 0 || search.length > MAX_REPORT_SHARE_BYTES) return null;
  const parsed = parseShareSearch(search);
  if (!parsed?.filters.from || !parsed.filters.to) return null;

  const projectKeys = parsed.filters.projectKeys ?? [];
  if (projectKeys.some((key) => !PROJECT_KEY.test(key))) return null;

  const principals: Principal[] = [];
  for (const item of parsed.filters.principals ?? []) {
    const next = principal(item);
    if (!next) return null;
    principals.push(next);
  }

  const filters: ReportFilters = {
    from: parsed.filters.from,
    to: parsed.filters.to,
    projectKeys,
    principals,
    additionalFieldIds: (parsed.filters.additionalFieldIds ?? []).filter((id) => FIELD_ID.test(id)),
    jql: plain(parsed.filters.jql ?? '', 4_000),
  };
  if (validateFilters(filters)) return null;

  const display: Partial<ReportDisplay> = { ...parsed.display };
  return { filters, display };
}
