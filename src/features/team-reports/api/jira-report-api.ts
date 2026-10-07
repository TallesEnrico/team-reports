import { requestJira } from '../../../api/jira-client';
import { searchIssues } from '../../../api/jira-search';
import { type JiraUser, type RawJiraUser, searchUsers, toJiraUser } from '../../../api/jira-users';
import { fetchIssueWorklogs, type RawWorklog, toWorklogEntry, type WorklogEntry } from '../../../api/jira-worklogs';
import { addDays, parseDateKey } from '../../../lib/dates';
import { mapWithConcurrency } from '../../../lib/mapWithConcurrency';
import { buildInProgressJql, buildReportJql } from '../lib/buildReportJql';
import type {
  JiraField,
  JiraGroup,
  Principal,
  ReportFilters,
  ReportIssue,
  WorklogReport,
} from '../types';

// ---------- Formatos crus da API REST v3 ----------

interface RawIssue {
  id: string;
  key: string;
  fields: Record<string, unknown> & {
    summary?: string;
    project?: { key: string; name: string };
    issuetype?: { name: string; iconUrl?: string };
    parent?: { id: string; key: string; fields?: { summary?: string; issuetype?: { iconUrl?: string } } };
    status?: { name: string; statusCategory?: { key?: string } };
    assignee?: RawJiraUser | null;
    worklog?: { total: number; worklogs: RawWorklog[] };
  };
}

interface PagedResponse<T> {
  isLast: boolean;
  values: T[];
}

interface RawField {
  id: string;
  name: string;
  custom: boolean;
  navigable?: boolean;
  schema?: { type?: string };
}

const BASE_ISSUE_FIELDS = ['summary', 'project', 'issuetype', 'parent', 'status', 'assignee', 'worklog'];
const MAX_PARALLEL_REQUESTS = 5;

// ---------- Metadados (usuário, projetos, campos, pessoas/grupos) ----------

// Campos que já aparecem no relatório ou não fazem sentido como coluna.
const HIDDEN_FIELD_IDS = new Set(['summary', 'worklog', 'thumbnail', 'issuekey', 'description', 'comment', 'attachment']);

export async function fetchFields(signal?: AbortSignal): Promise<JiraField[]> {
  const fields = await requestJira<RawField[]>('rest/api/3/field', { signal });
  return fields
    .filter((field) => field.navigable !== false && !HIDDEN_FIELD_IDS.has(field.id))
    .map((field) => ({ id: field.id, name: field.name, custom: field.custom, schemaType: field.schema?.type }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function searchUsersAndGroups(
  query: string,
  signal?: AbortSignal,
): Promise<{ users: JiraUser[]; groups: JiraGroup[] }> {
  const [users, groups] = await Promise.all([
    searchUsers(query, signal),
    requestJira<{ groups: JiraGroup[] }>('rest/api/3/groups/picker', { params: { query, maxResults: 20 }, signal }),
  ]);

  return { users, groups: groups.groups.map(({ groupId, name }) => ({ groupId, name })) };
}

async function fetchGroupMemberIds(groupId: string, signal?: AbortSignal): Promise<string[]> {
  const ids: string[] = [];
  for (let startAt = 0; ; startAt += 50) {
    const page = await requestJira<PagedResponse<RawJiraUser>>('rest/api/3/group/member', {
      params: { groupId, startAt, maxResults: 50, includeInactiveUsers: true },
      signal,
    });
    ids.push(...page.values.map((user) => user.accountId));
    if (page.isLast || page.values.length === 0) return ids;
  }
}

// ---------- Relatório ----------

/** Conjunto de autores cujos apontamentos entram no relatório; `null` = qualquer autor. */
async function resolveAuthorIds(
  principals: Principal[],
  currentAccountId: string,
  signal?: AbortSignal,
): Promise<Set<string> | null> {
  if (principals.length === 0) return null;

  const groups = principals.filter((p): p is Extract<Principal, { type: 'group' }> => p.type === 'group');
  const groupMembers = await mapWithConcurrency(groups, MAX_PARALLEL_REQUESTS, (group) =>
    fetchGroupMemberIds(group.groupId, signal),
  );

  const ids = new Set(groupMembers.flat());
  for (const principal of principals) {
    if (principal.type === 'current-user') ids.add(currentAccountId);
    if (principal.type === 'user') ids.add(principal.accountId);
  }
  return ids;
}

function toReportIssue(raw: RawIssue): ReportIssue {
  const { fields } = raw;
  return {
    id: raw.id,
    key: raw.key,
    summary: fields.summary ?? '',
    projectKey: fields.project?.key ?? raw.key.split('-')[0],
    projectName: fields.project?.name?.trim() ?? '',
    issueType: fields.issuetype ? { name: fields.issuetype.name, iconUrl: fields.issuetype.iconUrl } : undefined,
    parent: fields.parent
      ? {
          id: fields.parent.id,
          key: fields.parent.key,
          summary: fields.parent.fields?.summary ?? '',
          iconUrl: fields.parent.fields?.issuetype?.iconUrl,
        }
      : undefined,
    status: fields.status ? { name: fields.status.name, categoryKey: fields.status.statusCategory?.key } : undefined,
    assignee: fields.assignee ? toJiraUser(fields.assignee) : undefined,
    fields,
  };
}

export async function fetchWorklogReport(
  filters: ReportFilters,
  currentAccountId: string,
  signal?: AbortSignal,
): Promise<WorklogReport> {
  const jql = buildReportJql(filters);
  const fields = [...new Set([...BASE_ISSUE_FIELDS, ...filters.additionalFieldIds])];

  const [authorIds, rawIssues, inProgressIssues] = await Promise.all([
    resolveAuthorIds(filters.principals, currentAccountId, signal),
    searchIssues<RawIssue['fields']>(jql, fields, { signal }).then((result) => result.issues),
    searchIssues<RawIssue['fields']>(buildInProgressJql(filters), fields, { signal }).then((result) => result.issues),
  ]);

  // Mesma folga de ±1 dia do JQL: o corte exato por dia acontece no fuso do relatório.
  const window = {
    after: parseDateKey(addDays(filters.from, -1)).getTime(),
    before: parseDateKey(addDays(filters.to, 2)).getTime(),
  };

  // A busca embute no máximo 20 worklogs por issue; acima disso é preciso paginar.
  const worklogsPerIssue = await mapWithConcurrency(rawIssues, MAX_PARALLEL_REQUESTS, async (issue) => {
    const embedded = issue.fields.worklog;
    if (embedded && embedded.total <= embedded.worklogs.length) return embedded.worklogs;
    return fetchIssueWorklogs(issue.id, window, signal);
  });

  const authors: Record<string, JiraUser> = {};
  const worklogs: WorklogEntry[] = [];

  for (const raw of worklogsPerIssue.flat()) {
    const worklog = toWorklogEntry(raw);
    const startedAt = Date.parse(worklog.started);
    if (startedAt < window.after || startedAt >= window.before) continue;
    if (authorIds && !authorIds.has(worklog.authorId)) continue;

    if (raw.author && !authors[worklog.authorId]) authors[worklog.authorId] = toJiraUser(raw.author);
    worklogs.push(worklog);
  }

  const issues = rawIssues.map(toReportIssue);
  const seen = new Set(issues.map((issue) => issue.id));
  for (const raw of inProgressIssues) {
    if (!seen.has(raw.id)) issues.push(toReportIssue(raw));
  }

  return { filters, jql, issues, worklogs, authors };
}
