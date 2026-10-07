import { ISSUE_FIELDS, type JiraIssue, type RawIssueFields, toJiraIssue } from '../../../api/jira-issues';
import { searchIssues } from '../../../api/jira-search';
import { fetchIssueWorklogs, type RawWorklog } from '../../../api/jira-worklogs';
import { addDays, type DateKey, eachDay, parseDateKey, todayKey, toDateKeyInTimeZone } from '../../../lib/dates';
import { isWorkday } from '../../../lib/holidays';

const LOW_HOURS_SECONDS = 3 * 60 * 60;
const ISSUE_LIMIT = 100;

export interface ShortDay {
  date: DateKey;
  seconds: number;
}

export interface HomeIssueList {
  issues: JiraIssue[];
  isTruncated: boolean;
}

interface RawWorklogFields {
  worklog?: { total: number; worklogs: RawWorklog[] };
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export async function fetchShortDays(accountId: string, timeZone: string, signal?: AbortSignal): Promise<ShortDay[]> {
  const today = todayKey(timeZone);
  const from = `${today.slice(0, 7)}-01`;
  const jql = `worklogAuthor = currentUser() AND worklogDate >= ${quote(addDays(from, -1))} AND worklogDate <= ${quote(addDays(today, 1))}`;
  const { issues } = await searchIssues<RawWorklogFields>(jql, ['worklog'], { signal });
  const window = { after: parseDateKey(addDays(from, -1)).getTime(), before: parseDateKey(addDays(today, 2)).getTime() };

  const perIssue = await Promise.all(
    issues.map(async (issue) => {
      const embedded = issue.fields.worklog;
      if (embedded && embedded.total <= embedded.worklogs.length) return embedded.worklogs;
      return fetchIssueWorklogs(issue.id, window, signal);
    }),
  );

  const secondsByDay = new Map<DateKey, number>();
  for (const raw of perIssue.flat()) {
    if (raw.author?.accountId !== accountId) continue;
    const date = toDateKeyInTimeZone(raw.started, timeZone);
    if (date < from || date > today) continue;
    secondsByDay.set(date, (secondsByDay.get(date) ?? 0) + raw.timeSpentSeconds);
  }

  return eachDay(from, today)
    .filter((date) => isWorkday(date) && (secondsByDay.get(date) ?? 0) < LOW_HOURS_SECONDS)
    .map((date) => ({ date, seconds: secondsByDay.get(date) ?? 0 }));
}

export async function fetchHomeIssues(
  kind: 'in-progress' | 'completed',
  timeZone: string,
  signal?: AbortSignal,
): Promise<HomeIssueList> {
  const monthStart = `${todayKey(timeZone).slice(0, 7)}-01`;
  const jql =
    kind === 'in-progress'
      ? 'assignee = currentUser() AND statusCategory = "In Progress" ORDER BY updated DESC'
      : `assignee = currentUser() AND statusCategory = Done AND statusCategoryChangedDate >= ${quote(monthStart)} ORDER BY statusCategoryChangedDate DESC`;
  const result = await searchIssues<RawIssueFields>(jql, ISSUE_FIELDS, { signal, limit: ISSUE_LIMIT });
  return { issues: result.issues.map(toJiraIssue), isTruncated: result.isTruncated };
}
