import { addDays, type DateKey, zonedDateTimeToInstant } from '../lib/dates';
import { searchIssues } from './jira-search';
import { fetchIssueWorklogs, type RawWorklog } from './jira-worklogs';

interface RawDayFields {
  summary?: string;
  worklog?: { total: number; worklogs: RawWorklog[] };
}

/** Um apontamento da pessoa no dia, em minutos desde a meia-noite (no fuso pedido). */
export interface DayWorklog {
  id: string;
  issueKey: string;
  issueSummary: string;
  /** Cortados ao dia: o que começou na véspera conta a partir das 00:00, e o que passa da meia-noite, até ela. */
  startMinute: number;
  endMinute: number;
}

const DAY_MS = 86_400_000;
/** Issues com apontamento da pessoa num dia: dezenas, no máximo. */
const ISSUE_LIMIT = 200;

/**
 * Apontamentos de `accountId` (a conta conectada) no dia, em qualquer issue,
 * na ordem do início. A JQL tem um dia de folga para cada lado (o Jira avalia
 * `worklogDate` no fuso do dono do token); o corte exato do dia é feito aqui,
 * no fuso da tela. A busca traz até 20 apontamentos por issue; acima disso,
 * vêm do endpoint de apontamentos da issue, só os da janela.
 */
export async function fetchMyDayWorklogs(
  accountId: string,
  date: DateKey,
  timeZone: string,
  signal?: AbortSignal,
): Promise<DayWorklog[]> {
  const dayStart = zonedDateTimeToInstant(date, '00:00', timeZone).getTime();
  const dayEnd = zonedDateTimeToInstant(addDays(date, 1), '00:00', timeZone).getTime();
  const dayMinutes = (dayEnd - dayStart) / 60_000;
  const jql = `worklogAuthor = currentUser() AND worklogDate >= "${addDays(date, -1)}" AND worklogDate <= "${addDays(date, 1)}"`;
  const { issues } = await searchIssues<RawDayFields>(jql, ['summary', 'worklog'], { signal, limit: ISSUE_LIMIT });

  // Desde a véspera: um apontamento que começou ontem à noite pode entrar no dia.
  const window = { after: dayStart - DAY_MS, before: dayEnd };
  const perIssue = await Promise.all(
    issues.map(async (issue) => {
      const embedded = issue.fields.worklog;
      const raws =
        embedded && embedded.total <= embedded.worklogs.length
          ? embedded.worklogs
          : await fetchIssueWorklogs(issue.id, window, signal);
      return raws.map((raw) => ({ raw, issue }));
    }),
  );

  const worklogs: DayWorklog[] = [];
  for (const { raw, issue } of perIssue.flat()) {
    if (raw.author?.accountId !== accountId) continue;
    const start = Date.parse(raw.started);
    const end = start + raw.timeSpentSeconds * 1000;
    if (end <= dayStart || start >= dayEnd) continue;
    worklogs.push({
      id: raw.id,
      issueKey: issue.key,
      issueSummary: issue.fields.summary ?? '',
      startMinute: Math.max(0, (start - dayStart) / 60_000),
      endMinute: Math.min(dayMinutes, (end - dayStart) / 60_000),
    });
  }
  return worklogs.sort((a, b) => a.startMinute - b.startMinute);
}
