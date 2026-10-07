import { isDateKey } from '../../../lib/dates';
import type { TimeFormat } from '../../../lib/formatDuration';
import type { GroupBy, PeriodGrouping, Principal, ReportDisplay, ReportFilters } from '../types';
import { isReportTimeZone } from '../../../lib/timeZones';

// Parâmetros do link. Todos são escritos sempre (inclusive vazios), para quem
// abre ver exatamente o mesmo recorte: `projects=` vazio = todos os projetos.
const PARAM = {
  from: 'from',
  to: 'to',
  projects: 'projects',
  user: 'user',
  group: 'group',
  currentUser: 'me',
  allPeople: 'people',
  fields: 'fields',
  jql: 'jql',
  groupBy: 'groupBy',
  period: 'period',
  timeFormat: 'format',
  timeZone: 'tz',
} as const;

const GROUP_BY = new Set<GroupBy>(['issue', 'parent', 'user', 'project']);
const PERIODS = new Set<PeriodGrouping>(['day', 'week', 'month']);
const TIME_FORMATS = new Set<TimeFormat>(['hours-minutes', 'decimal', 'clock']);

export interface SharedReport {
  filters: Partial<ReportFilters>;
  display: Partial<ReportDisplay>;
}

export function filtersForShare(
  filters: ReportFilters,
  me: { accountId: string; displayName: string } | null | undefined,
): ReportFilters {
  if (!me) return filters;
  return {
    ...filters,
    principals: filters.principals.map((principal) =>
      principal.type === 'current-user' ? { type: 'user', accountId: me.accountId, displayName: me.displayName } : principal,
    ),
  };
}

function list(values: string[]): string {
  return values.join(',');
}

function parseList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** `id|nome`: o nome vai junto para o chip aparecer sem consultar a API. */
function parseIdAndName(value: string): [string, string] | null {
  const separator = value.indexOf('|');
  const id = (separator === -1 ? value : value.slice(0, separator)).trim();
  const name = separator === -1 ? id : value.slice(separator + 1).trim() || id;
  return id ? [id, name] : null;
}

export function buildShareSearch(filters: ReportFilters, display: ReportDisplay): string {
  const params = new URLSearchParams();
  params.set(PARAM.from, filters.from);
  params.set(PARAM.to, filters.to);
  params.set(PARAM.projects, list(filters.projectKeys));

  if (filters.principals.length === 0) params.set(PARAM.allPeople, 'all');
  for (const principal of filters.principals) {
    if (principal.type === 'current-user') params.append(PARAM.currentUser, '1');
    if (principal.type === 'user') params.append(PARAM.user, `${principal.accountId}|${principal.displayName}`);
    if (principal.type === 'group') params.append(PARAM.group, `${principal.groupId}|${principal.name}`);
  }

  params.set(PARAM.fields, list(filters.additionalFieldIds));
  params.set(PARAM.jql, filters.jql);
  params.set(PARAM.groupBy, display.groupBy);
  params.set(PARAM.period, display.period);
  params.set(PARAM.timeFormat, display.timeFormat);
  params.set(PARAM.timeZone, display.timeZone);
  return params.toString();
}

export const REPORTS_ROUTE = '/reports';

export function buildShareUrl(filters: ReportFilters, display: ReportDisplay, location: Location = window.location): string {
  return `${location.origin}${REPORTS_ROUTE}?${buildShareSearch(filters, display)}`;
}

/** `?…` de dentro do hash (`#/reports?from=…`), ou '' se não houver. */
function hashQuery(hash: string): string {
  const index = hash.indexOf('?');
  return index === -1 ? '' : hash.slice(index);
}

export function readShareSearch(location: Location = window.location): string {
  return location.search || hashQuery(location.hash);
}

export function openLegacyShareLink(location: Location = window.location, history: History = window.history): void {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/' && location.search && parseShareSearch(location.search)) {
    history.replaceState(history.state, '', `${REPORTS_ROUTE}${location.search}`);
  }
}

/**
 * Lê um link compartilhado. Valores inválidos são ignorados (ficam os salvos),
 * para um link editado à mão não quebrar a tela. `null` se não for um link de filtros.
 */
export function parseShareSearch(search: string): SharedReport | null {
  const params = new URLSearchParams(search);
  const filters: Partial<ReportFilters> = {};
  const display: Partial<ReportDisplay> = {};

  const from = params.get(PARAM.from);
  const to = params.get(PARAM.to);
  if (from && isDateKey(from)) filters.from = from;
  if (to && isDateKey(to)) filters.to = to;

  const projects = params.get(PARAM.projects);
  if (projects !== null) filters.projectKeys = parseList(projects);

  const principals: Principal[] = [];
  if (params.getAll(PARAM.currentUser).length > 0) principals.push({ type: 'current-user' });
  for (const value of params.getAll(PARAM.user)) {
    const parsed = parseIdAndName(value);
    if (parsed) principals.push({ type: 'user', accountId: parsed[0], displayName: parsed[1] });
  }
  for (const value of params.getAll(PARAM.group)) {
    const parsed = parseIdAndName(value);
    if (parsed) principals.push({ type: 'group', groupId: parsed[0], name: parsed[1] });
  }
  if (principals.length > 0) filters.principals = principals;
  else if (params.get(PARAM.allPeople) === 'all') filters.principals = [];

  const fields = params.get(PARAM.fields);
  if (fields !== null) filters.additionalFieldIds = parseList(fields);

  const jql = params.get(PARAM.jql);
  if (jql !== null) filters.jql = jql;

  const groupBy = params.get(PARAM.groupBy);
  if (GROUP_BY.has(groupBy as GroupBy)) display.groupBy = groupBy as GroupBy;
  const period = params.get(PARAM.period);
  if (PERIODS.has(period as PeriodGrouping)) display.period = period as PeriodGrouping;
  const timeFormat = params.get(PARAM.timeFormat);
  if (TIME_FORMATS.has(timeFormat as TimeFormat)) display.timeFormat = timeFormat as TimeFormat;
  const timeZone = params.get(PARAM.timeZone);
  if (isReportTimeZone(timeZone)) display.timeZone = timeZone;

  return Object.keys(filters).length > 0 || Object.keys(display).length > 0 ? { filters, display } : null;
}

/** Remove os filtros da barra de endereço depois de aplicados (recarregar não reaplica o link). */
export function clearShareSearch(location: Location = window.location, history: History = window.history): void {
  const inSearch = Boolean(location.search && parseShareSearch(location.search));
  const query = hashQuery(location.hash);
  const inHash = Boolean(query && parseShareSearch(query));
  if (!inSearch && !inHash) return;

  const search = inSearch ? '' : location.search;
  const hash = inHash ? location.hash.slice(0, location.hash.indexOf('?')) : location.hash;
  history.replaceState(history.state, '', `${location.pathname}${search}${hash}`);
}
