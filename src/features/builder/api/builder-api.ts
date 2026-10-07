import { ISSUE_FIELDS, type RawIssueFields, toJiraIssue } from '../../../api/jira-issues';
import { searchIssues } from '../../../api/jira-search';
import { type JiraUser, toJiraUser } from '../../../api/jira-users';
import { fetchIssueWorklogs, type RawWorklog, toWorklogEntry } from '../../../api/jira-worklogs';
import { addDays, type DateKey, parseDateKey, toDateKeyInTimeZone } from '../../../lib/dates';
import { mapWithConcurrency } from '../../../lib/mapWithConcurrency';
import type { SourceData } from '../lib/evaluate';
import type { IssueSelection, SourceIssue, WorklogRecord } from '../types';

interface RawSourceFields extends RawIssueFields {
  project?: { key: string; name: string };
  created?: string;
  updated?: string;
  statuscategorychangedate?: string;
  worklog?: { total: number; worklogs: RawWorklog[] };
}

/** Issues por peça: o bastante para um mês de todas as squads, sem deixar a tela presa por minutos. */
const ISSUE_LIMIT = 5000;
/** accountIds por busca: a JQL vai na URL (GET), e uma lista longa passaria do tamanho aceito. */
const PEOPLE_PER_SEARCH = 40;
const MAX_PARALLEL_REQUESTS = 5;
const ISSUE_DATE_FIELDS = ['project', 'created', 'updated', 'statuscategorychangedate'];

function quote(value: string): string {
  return `"${value.replace(/["\\]/g, '')}"`;
}

function quoteList(values: string[]): string {
  return `(${values.map(quote).join(', ')})`;
}

/** De quem são os dados pedidos: todas as pessoas, as escolhidas (accountIds) ou a conta conectada. */
export interface PeopleQuery {
  mode: 'all' | 'chosen' | 'me';
  /** Em ordem: a mesma escolha em outra ordem reaproveita o cache. */
  accountIds: string[];
}

/**
 * Cláusulas de pessoa da JQL (`worklogAuthor`, `assignee`): uma por busca. As
 * escolhidas vão em grupos de 40; todas as pessoas, sem cláusula.
 */
function peopleClauses(field: string, people: PeopleQuery): (string | undefined)[] {
  if (people.mode === 'me') return [`${field} = currentUser()`];
  if (people.mode === 'all') return [undefined];
  const clauses: string[] = [];
  for (let start = 0; start < people.accountIds.length; start += PEOPLE_PER_SEARCH) {
    clauses.push(`${field} in ${quoteList(people.accountIds.slice(start, start + PEOPLE_PER_SEARCH))}`);
  }
  return clauses;
}

/** As buscas de cada grupo de pessoas, juntas e sem repetir issue; parou no limite se alguma parou. */
async function searchAll<Fields>(jqls: string[], fields: string[], signal?: AbortSignal) {
  const results = await Promise.all(jqls.map((jql) => searchIssues<Fields>(jql, fields, { signal, limit: ISSUE_LIMIT })));
  const issues = [...new Map(results.flatMap((result) => result.issues).map((issue) => [issue.id, issue])).values()];
  return { issues, isTruncated: results.some((result) => result.isTruncated) };
}

/** A JQL a mais vai entre parênteses, somada com AND (um `OR` dentro dela não escapa do resto). */
function extraJql(jql: string): string | undefined {
  const trimmed = jql.trim();
  return trimmed ? `(${trimmed})` : undefined;
}

function toSourceIssue(raw: { id: string; key: string; fields: RawSourceFields }, timeZone: string): SourceIssue {
  const issue = toJiraIssue(raw);
  const { fields } = raw;
  const dateOf = (value: string | undefined) => (value ? toDateKeyInTimeZone(value, timeZone) : undefined);
  return {
    ...issue,
    projectKey: fields.project?.key ?? raw.key.slice(0, raw.key.lastIndexOf('-')),
    projectName: fields.project?.name?.trim() ?? '',
    createdDate: dateOf(fields.created),
    updatedDate: dateOf(fields.updated),
    doneDate: issue.status.categoryKey === 'done' ? dateOf(fields.statuscategorychangedate) : undefined,
  };
}

export interface WorklogsQuery {
  /** Squads (projetos); vazio = todas. */
  projectKeys: string[];
  people: PeopleQuery;
  /** A conta conectada (com `people.mode = 'me'`). */
  accountId: string | undefined;
  from: DateKey;
  to: DateKey;
  jql: string;
  timeZone: string;
}

/**
 * Apontamentos do período nas issues que passam na busca. A JQL tem um dia de
 * folga para cada lado (o Jira avalia `worklogDate` no fuso do dono do token); o
 * corte exato dos dias é feito aqui, no fuso da tela. A busca traz até 20
 * apontamentos por issue; acima disso, eles vêm do endpoint de apontamentos da
 * issue, só os da janela.
 */
export async function fetchWorklogsSource(query: WorklogsQuery, signal?: AbortSignal): Promise<SourceData> {
  const { from, to, timeZone, people } = query;
  const jqls = peopleClauses('worklogAuthor', people).map((authorClause) =>
    [
      query.projectKeys.length > 0 ? `project in ${quoteList(query.projectKeys)}` : undefined,
      authorClause,
      `worklogDate >= ${quote(addDays(from, -1))} AND worklogDate <= ${quote(addDays(to, 1))}`,
      extraJql(query.jql),
    ]
      .filter(Boolean)
      .join(' AND '),
  );
  const { issues: rawIssues, isTruncated } = await searchAll<RawSourceFields>(
    jqls,
    [...ISSUE_FIELDS, ...ISSUE_DATE_FIELDS, 'worklog'],
    signal,
  );
  // A issue vem por ter um apontamento da pessoa; os das outras pessoas nela ficam de fora.
  const chosen = new Set(people.accountIds);
  const acceptAuthor = (accountId: string) =>
    people.mode === 'all' || (people.mode === 'me' ? accountId === query.accountId : chosen.has(accountId));

  const window = { after: parseDateKey(addDays(from, -1)).getTime(), before: parseDateKey(addDays(to, 2)).getTime() };
  const worklogsPerIssue = await mapWithConcurrency(rawIssues, MAX_PARALLEL_REQUESTS, async (issue) => {
    const embedded = issue.fields.worklog;
    if (embedded && embedded.total <= embedded.worklogs.length) return embedded.worklogs;
    return fetchIssueWorklogs(issue.id, window, signal);
  });

  // Uma pessoa é um objeto só, em todos os apontamentos dela.
  const authors = new Map<string, JiraUser>();
  const records: WorklogRecord[] = [];
  rawIssues.forEach((rawIssue, index) => {
    const issue = toSourceIssue(rawIssue, timeZone);
    for (const raw of worklogsPerIssue[index]) {
      const entry = toWorklogEntry(raw);
      const date = toDateKeyInTimeZone(entry.started, timeZone);
      if (date < from || date > to || !acceptAuthor(entry.authorId)) continue;
      let author = authors.get(entry.authorId);
      if (!author) {
        author = raw.author ? toJiraUser(raw.author) : { accountId: entry.authorId, displayName: 'Pessoa sem nome no Jira' };
        authors.set(entry.authorId, author);
      }
      records.push({ id: entry.id, date, seconds: entry.seconds, comment: entry.comment, author, issue });
    }
  });
  records.sort((a, b) => a.date.localeCompare(b.date));
  assignAuthorSquads(records);

  return {
    dataset: { kind: 'records', source: 'worklogs', records, period: { from, to }, periodField: 'worklog' },
    isTruncated,
  };
}

/**
 * A squad de cada pessoa: a squad (projeto) em que ela mais lançou horas nos
 * dados buscados; empate, a primeira pelo nome. Com todas as squads, mostra onde
 * a pessoa trabalha, mesmo com horas em projetos de reunião.
 */
function assignAuthorSquads(records: WorklogRecord[]) {
  const secondsBySquad = new Map<string, Map<string, { name: string; seconds: number }>>();
  for (const record of records) {
    let squads = secondsBySquad.get(record.author.accountId);
    if (!squads) {
      squads = new Map();
      secondsBySquad.set(record.author.accountId, squads);
    }
    const squad = squads.get(record.issue.projectKey) ?? { name: record.issue.projectName, seconds: 0 };
    squad.seconds += record.seconds;
    squads.set(record.issue.projectKey, squad);
  }
  const mainSquad = new Map<string, { key: string; name: string }>();
  for (const [accountId, squads] of secondsBySquad) {
    const [key, squad] = [...squads].sort(
      ([keyA, a], [keyB, b]) => b.seconds - a.seconds || (a.name || keyA).localeCompare(b.name || keyB, 'pt-BR'),
    )[0];
    mainSquad.set(accountId, { key, name: squad.name });
  }
  for (const record of records) record.authorSquad = mainSquad.get(record.author.accountId);
}

export interface IssuesQuery {
  /** Squads (projetos); vazio = todas. */
  projectKeys: string[];
  selection: IssueSelection;
  /** Período das concluídas, criadas ou atualizadas (não vale para as abertas). */
  from: DateKey | undefined;
  to: DateKey | undefined;
  /** De quem são as issues (responsável). */
  people: PeopleQuery;
  jql: string;
  timeZone: string;
}

const PERIOD_FIELDS: Record<Exclude<IssueSelection, 'open'>, string> = {
  done: 'statusCategoryChangedDate',
  created: 'created',
  updated: 'updated',
};

/** Issues que passam na busca (abertas agora, ou concluídas, criadas ou atualizadas no período). */
export async function fetchIssuesSource(query: IssuesQuery, signal?: AbortSignal): Promise<SourceData> {
  const { selection, from, to } = query;
  const periodJql =
    selection === 'open' || !from || !to
      ? undefined
      : `${PERIOD_FIELDS[selection]} >= ${quote(from)} AND ${PERIOD_FIELDS[selection]} < ${quote(addDays(to, 1))}`;
  const jqls = peopleClauses('assignee', query.people).map(
    (assigneeClause) =>
      [
        query.projectKeys.length > 0 ? `project in ${quoteList(query.projectKeys)}` : undefined,
        selection === 'open' ? 'statusCategory != Done' : selection === 'done' ? 'statusCategory = Done' : undefined,
        periodJql,
        assigneeClause,
        extraJql(query.jql),
      ]
        .filter(Boolean)
        .join(' AND ') + ' ORDER BY created DESC',
  );
  const { issues, isTruncated } = await searchAll<RawSourceFields>(jqls, [...ISSUE_FIELDS, ...ISSUE_DATE_FIELDS], signal);
  const records = issues.map((raw) => toSourceIssue(raw, query.timeZone));
  const period = selection !== 'open' && from && to ? { from, to } : undefined;
  return { dataset: { kind: 'records', source: 'issues', records, period, periodField: selection }, isTruncated };
}
