import { ISSUE_FIELDS, type RawIssueFields, toJiraIssue } from '../../../api/jira-issues';
import { searchIssues } from '../../../api/jira-search';
import { type JiraUser, toJiraUser } from '../../../api/jira-users';
import { fetchIssueWorklogs, type RawWorklog, toWorklogEntry, type WorklogEntry } from '../../../api/jira-worklogs';
import { addDays, parseDateKey } from '../../../lib/dates';
import { monthRange } from '../lib/months';
import { createRequestQueue } from '../lib/requestQueue';
import type { MetricsIssue, MonthKey, MonthWorklogs } from '../types';

interface RawMetricsFields extends RawIssueFields {
  project?: { key: string; name: string };
  worklog?: { total: number; worklogs: RawWorklog[] };
}

const FIELDS = [...ISSUE_FIELDS, 'project', 'worklog'];

/** Um mês com 3, 6 ou 12 de comparação passa de centenas de requisições: todas dividem esta fila. */
const enqueue = createRequestQueue(6);

/** accountIds por busca: a JQL vai na URL (GET), e uma lista longa passaria do tamanho aceito. */
const AUTHORS_PER_SEARCH = 40;

function quote(value: string): string {
  return `"${value.replace(/["\\]/g, '')}"`;
}

function quoteList(values: string[]): string {
  return `(${values.map(quote).join(', ')})`;
}

/**
 * Datas da JQL e janela dos apontamentos: um dia a mais para cada lado, porque
 * o Jira avalia `worklogDate` no fuso do dono do token. O corte exato do mês é
 * feito na tela, no fuso dela.
 */
function monthWindow(month: MonthKey) {
  const { from, to } = monthRange(month);
  return {
    jql: `worklogDate >= ${quote(addDays(from, -1))} AND worklogDate <= ${quote(addDays(to, 1))}`,
    after: parseDateKey(addDays(from, -1)).getTime(),
    before: parseDateKey(addDays(to, 2)).getTime(),
  };
}

function toMetricsIssue(raw: { id: string; key: string; fields: RawMetricsFields }): MetricsIssue {
  return {
    ...toJiraIssue(raw),
    projectKey: raw.fields.project?.key ?? raw.key.split('-')[0],
    projectName: raw.fields.project?.name?.trim() ?? '',
  };
}

/**
 * Issues das buscas e os apontamentos delas na janela do mês, de quem passar em
 * `acceptAuthor`. A busca traz no máximo 20 apontamentos por issue; acima disso
 * eles vêm do endpoint de apontamentos da issue, só os da janela.
 */
async function fetchWorklogsOfSearches(
  month: MonthKey,
  jqls: string[],
  acceptAuthor: (accountId: string) => boolean,
  priority: number,
  signal?: AbortSignal,
): Promise<MonthWorklogs> {
  const window = monthWindow(month);
  const results = await Promise.all(
    jqls.map((jql) => enqueue(priority, () => searchIssues<RawMetricsFields>(jql, FIELDS, { signal }))),
  );
  const rawIssues = [...new Map(results.flatMap((result) => result.issues).map((issue) => [issue.id, issue])).values()];

  const worklogsPerIssue = await Promise.all(
    rawIssues.map((issue) => {
      const embedded = issue.fields.worklog;
      if (embedded && embedded.total <= embedded.worklogs.length) return embedded.worklogs;
      return enqueue(priority, () => fetchIssueWorklogs(issue.id, window, signal));
    }),
  );

  const authors: Record<string, JiraUser> = {};
  const worklogs: WorklogEntry[] = [];
  for (const raw of worklogsPerIssue.flat()) {
    const worklog = toWorklogEntry(raw);
    const startedAt = Date.parse(worklog.started);
    if (startedAt < window.after || startedAt >= window.before || !acceptAuthor(worklog.authorId)) continue;
    if (raw.author && !authors[worklog.authorId]) authors[worklog.authorId] = toJiraUser(raw.author);
    worklogs.push(worklog);
  }

  // Só as issues com algum apontamento que ficou (as outras vieram pela folga de datas ou por outra pessoa).
  const withWorklogs = new Set(worklogs.map((worklog) => worklog.issueId));
  const issues = rawIssues.filter((issue) => withWorklogs.has(issue.id)).map(toMetricsIssue);
  return { issues, worklogs, authors };
}

/** Apontamentos do mês nas issues das squads, de qualquer pessoa: as horas das squads e quem as lançou. */
export function fetchSquadMonth(
  month: MonthKey,
  projectKeys: string[],
  priority: number,
  signal?: AbortSignal,
): Promise<MonthWorklogs> {
  const jql = `project in ${quoteList(projectKeys)} AND ${monthWindow(month).jql}`;
  return fetchWorklogsOfSearches(month, [jql], () => true, priority, signal);
}

/**
 * Apontamentos do mês das pessoas em `accountIds` nas issues de fora das squads
 * (ex: reuniões em outro projeto); sem squad, em qualquer projeto.
 */
export function fetchOtherProjectsMonth(
  month: MonthKey,
  projectKeys: string[],
  accountIds: string[],
  priority: number,
  signal?: AbortSignal,
): Promise<MonthWorklogs> {
  const chunks: string[][] = [];
  for (let start = 0; start < accountIds.length; start += AUTHORS_PER_SEARCH) {
    chunks.push(accountIds.slice(start, start + AUTHORS_PER_SEARCH));
  }
  const outsideSquads = projectKeys.length > 0 ? ` AND project not in ${quoteList(projectKeys)}` : '';
  const jqls = chunks.map((chunk) => `worklogAuthor in ${quoteList(chunk)}${outsideSquads} AND ${monthWindow(month).jql}`);
  const accepted = new Set(accountIds);
  return fetchWorklogsOfSearches(month, jqls, (accountId) => accepted.has(accountId), priority, signal);
}
