import { type DateKey, eachDay, toDateKeyInTimeZone } from '../../../lib/dates';
import { holidayOn, isWorkday } from '../../../lib/holidays';
import type { DayRanges, HoursScope, JiraUser, MetricsIssue, MonthKey, MonthWorklogs, WorklogEntry } from '../types';
import { monthRange } from './months';

// ---------- Calendário ----------

export interface MonthDay {
  date: DateKey;
  /** Segunda a sexta, fora de feriados nacionais e pontos facultativos (lib/holidays). */
  isWorkday: boolean;
  holiday?: string;
  /** Já terminou (antes de hoje): conta na jornada esperada. */
  isElapsed: boolean;
  isToday: boolean;
}

/**
 * Situação de um dia de uma pessoa, pelas faixas (`DayRanges`): `danger` (menos
 * que o vermelho), `alert` (do vermelho até abaixo do amarelo), `success` (do
 * amarelo até a jornada), `over` (acima da jornada), `missing` (dia útil que
 * passou sem nada), `off` (fim de semana ou feriado) e `pending` (hoje ou
 * adiante, ainda abaixo do verde).
 */
export type DayStatus = 'danger' | 'alert' | 'success' | 'over' | 'missing' | 'off' | 'pending';

export function buildMonthDays(month: MonthKey, today: DateKey): MonthDay[] {
  const { from, to } = monthRange(month);
  return eachDay(from, to).map((date) => ({
    date,
    isWorkday: isWorkday(date),
    holiday: holidayOn(date),
    isElapsed: date < today,
    isToday: date === today,
  }));
}

export function dayStatus(day: MonthDay, seconds: number, ranges: DayRanges): DayStatus {
  if (!day.isWorkday) return 'off';
  if (seconds > ranges.success) return 'over';
  if (seconds > 0 && seconds >= ranges.alert) return 'success';
  // Hoje ainda pode chegar na jornada: abaixo do verde, não é cobrado.
  if (!day.isElapsed) return 'pending';
  if (seconds === 0) return 'missing';
  return seconds < ranges.danger ? 'danger' : 'alert';
}

// ---------- Modelo ----------

export interface PersonMonth {
  month: MonthKey;
  seconds: number;
  expectedSeconds: number;
  coverage?: number;
  isLoaded: boolean;
}

export interface IssueHours {
  issue: MetricsIssue;
  seconds: number;
  /** Quantas pessoas lançaram nela (no recorte). */
  people: number;
}

export interface PersonMetrics {
  user: JiraUser;
  seconds: number;
  expectedSeconds: number;
  /** Lançado / esperado; sem dia útil decorrido no mês, não há cobertura. */
  coverage?: number;
  secondsByDay: Record<DateKey, number>;
  /** Dias úteis que já passaram sem nenhum apontamento. */
  missingDays: DateKey[];
  /** Dias úteis que já passaram com menos que a jornada. */
  partialDays: DateKey[];
  /** Nada lançado no último dia útil que já passou. */
  missedLastWorkday: boolean;
  /** Último dia com apontamento nos meses carregados. */
  lastLoggedDay?: DateKey;
  /** Apontamentos do mês, em ordem de início. */
  worklogs: WorklogEntry[];
  issues: IssueHours[];
  /** Mês a mês, do mais antigo ao escolhido. */
  months: PersonMonth[];
}

export interface TeamDay {
  date: DateKey;
  seconds: number;
  expectedSeconds: number;
  peopleLogged: number;
  /** Pessoas sem nenhum apontamento no dia (só em dia útil que já passou). */
  peopleMissing: number;
}

export interface TeamMonth {
  month: MonthKey;
  seconds: number;
  expectedSeconds: number;
  coverage?: number;
  elapsedWorkdays: number;
  totalWorkdays: number;
  /** O mês ainda não terminou: o esperado conta só os dias úteis que já passaram. */
  isPartial: boolean;
  isLoaded: boolean;
}

export interface ProjectHours {
  key: string;
  name: string;
  seconds: number;
  isSquad: boolean;
}

export interface MetricsModel {
  month: MonthKey;
  days: MonthDay[];
  /** Faixas das horas de um dia útil (cores dos dias). */
  dayRanges: DayRanges;
  /** A jornada (`dayRanges.success`): o esperado por dia útil. */
  targetSeconds: number;
  elapsedWorkdays: number;
  totalWorkdays: number;
  /** Último dia útil que já passou, no mês. */
  lastWorkday?: DateKey;
  people: PersonMetrics[];
  team: {
    seconds: number;
    expectedSeconds: number;
    coverage?: number;
    /** Cobertura do mês anterior, quando carregado (para a variação). */
    previous?: { month: MonthKey; coverage?: number };
    issuesWorked: number;
    issuesDone: number;
    issuesInProgress: number;
  };
  daily: TeamDay[];
  /** Do mais antigo ao escolhido. */
  monthly: TeamMonth[];
  projects: ProjectHours[];
  topIssues: IssueHours[];
  /** As issues com horas no mês (abrem o modal da issue). */
  issues: MetricsIssue[];
}

export interface MetricsInput {
  /** O mês escolhido primeiro, depois os anteriores. */
  months: MonthKey[];
  /** Dados de cada mês de `months` (já com os outros projetos), ou `undefined` enquanto carrega. */
  data: (MonthWorklogs | undefined)[];
  roster: JiraUser[];
  /** As squads escolhidas. */
  projectKeys: string[];
  scope: HoursScope;
  /** Faixas das horas de um dia útil; a jornada (`success`) é o esperado por dia útil. */
  dayRanges: DayRanges;
  timeZone: string;
  today: DateKey;
}

interface Entry {
  worklog: WorklogEntry;
  issue: MetricsIssue;
  date: DateKey;
}

const TOP_ISSUES = 10;

function add<K>(map: Map<K, number>, key: K, seconds: number) {
  map.set(key, (map.get(key) ?? 0) + seconds);
}

function ratio(seconds: number, expectedSeconds: number): number | undefined {
  return expectedSeconds > 0 ? seconds / expectedSeconds : undefined;
}

/** Apontamentos do mês da equipe, no recorte (fuso, mês exato, só as squads). */
function entriesOf(
  month: MonthKey,
  data: MonthWorklogs | undefined,
  rosterIds: Set<string>,
  squadKeys: Set<string>,
  input: MetricsInput,
): Entry[] {
  if (!data) return [];
  const issuesById = new Map(data.issues.map((issue) => [issue.id, issue]));
  const { from, to } = monthRange(month);
  const entries: Entry[] = [];
  for (const worklog of data.worklogs) {
    if (!rosterIds.has(worklog.authorId)) continue;
    const issue = issuesById.get(worklog.issueId);
    if (!issue || (input.scope === 'squad' && !squadKeys.has(issue.projectKey))) continue;
    const date = toDateKeyInTimeZone(worklog.started, input.timeZone);
    if (date >= from && date <= to) entries.push({ worklog, issue, date });
  }
  return entries;
}

function issueHours(entries: Entry[]): IssueHours[] {
  const byIssue = new Map<string, { issue: MetricsIssue; seconds: number; people: Set<string> }>();
  for (const { worklog, issue } of entries) {
    const current = byIssue.get(issue.id) ?? { issue, seconds: 0, people: new Set<string>() };
    current.seconds += worklog.seconds;
    current.people.add(worklog.authorId);
    byIssue.set(issue.id, current);
  }
  return [...byIssue.values()]
    .map(({ issue, seconds, people }) => ({ issue, seconds, people: people.size }))
    .sort((a, b) => b.seconds - a.seconds);
}

/** Indicadores do mês escolhido e a comparação com os anteriores. Sem os dados do mês escolhido, `undefined`. */
export function buildMetrics(input: MetricsInput): MetricsModel | undefined {
  const { months, roster, dayRanges, today } = input;
  const targetSeconds = dayRanges.success;
  if (!input.data[0]) return undefined;
  const rosterIds = new Set(roster.map((user) => user.accountId));
  const squadKeys = new Set(input.projectKeys);

  const summaries = months.map((month, index) => {
    const days = buildMonthDays(month, today);
    const entries = entriesOf(month, input.data[index], rosterIds, squadKeys, input);
    const secondsByPerson = new Map<string, number>();
    for (const { worklog } of entries) add(secondsByPerson, worklog.authorId, worklog.seconds);
    const elapsedWorkdays = days.filter((day) => day.isWorkday && day.isElapsed).length;
    return {
      month,
      days,
      entries,
      secondsByPerson,
      elapsedWorkdays,
      totalWorkdays: days.filter((day) => day.isWorkday).length,
      isLoaded: Boolean(input.data[index]),
    };
  });

  const [current] = summaries;
  const { days, entries, elapsedWorkdays } = current;
  const lastWorkday = days.filter((day) => day.isWorkday && day.isElapsed).at(-1)?.date;
  const elapsedWorkdayKeys = days.filter((day) => day.isWorkday && day.isElapsed).map((day) => day.date);

  const lastLogged = new Map<string, DateKey>();
  for (const summary of summaries) {
    for (const { worklog, date } of summary.entries) {
      const previous = lastLogged.get(worklog.authorId);
      if (!previous || date > previous) lastLogged.set(worklog.authorId, date);
    }
  }

  const entriesByPerson = new Map<string, Entry[]>();
  for (const entry of entries) {
    const list = entriesByPerson.get(entry.worklog.authorId) ?? [];
    list.push(entry);
    entriesByPerson.set(entry.worklog.authorId, list);
  }

  const people = roster.map((user): PersonMetrics => {
    const own = entriesByPerson.get(user.accountId) ?? [];
    const secondsByDay: Record<DateKey, number> = {};
    for (const { worklog, date } of own) secondsByDay[date] = (secondsByDay[date] ?? 0) + worklog.seconds;
    const seconds = current.secondsByPerson.get(user.accountId) ?? 0;
    const expectedSeconds = elapsedWorkdays * targetSeconds;
    return {
      user,
      seconds,
      expectedSeconds,
      coverage: ratio(seconds, expectedSeconds),
      secondsByDay,
      missingDays: elapsedWorkdayKeys.filter((date) => !secondsByDay[date]),
      partialDays: elapsedWorkdayKeys.filter((date) => secondsByDay[date] > 0 && secondsByDay[date] < targetSeconds),
      missedLastWorkday: Boolean(lastWorkday && !secondsByDay[lastWorkday]),
      lastLoggedDay: lastLogged.get(user.accountId),
      worklogs: own.map((entry) => entry.worklog).sort((a, b) => Date.parse(a.started) - Date.parse(b.started)),
      issues: issueHours(own),
      months: [...summaries].reverse().map((summary) => {
        const monthSeconds = summary.secondsByPerson.get(user.accountId) ?? 0;
        const monthExpected = summary.elapsedWorkdays * targetSeconds;
        return {
          month: summary.month,
          seconds: monthSeconds,
          expectedSeconds: monthExpected,
          coverage: ratio(monthSeconds, monthExpected),
          isLoaded: summary.isLoaded,
        };
      }),
    };
  });

  const secondsByDay = new Map<DateKey, number>();
  const loggedByDay = new Map<DateKey, Set<string>>();
  for (const { worklog, date } of entries) {
    add(secondsByDay, date, worklog.seconds);
    const logged = loggedByDay.get(date) ?? new Set<string>();
    logged.add(worklog.authorId);
    loggedByDay.set(date, logged);
  }
  const daily = days.map((day): TeamDay => {
    const peopleLogged = loggedByDay.get(day.date)?.size ?? 0;
    return {
      date: day.date,
      seconds: secondsByDay.get(day.date) ?? 0,
      expectedSeconds: day.isWorkday ? targetSeconds * roster.length : 0,
      peopleLogged,
      peopleMissing: day.isWorkday && day.isElapsed ? roster.length - peopleLogged : 0,
    };
  });

  const monthly = [...summaries].reverse().map((summary): TeamMonth => {
    const seconds = [...summary.secondsByPerson.values()].reduce((sum, value) => sum + value, 0);
    const expectedSeconds = summary.elapsedWorkdays * targetSeconds * roster.length;
    return {
      month: summary.month,
      seconds,
      expectedSeconds,
      coverage: ratio(seconds, expectedSeconds),
      elapsedWorkdays: summary.elapsedWorkdays,
      totalWorkdays: summary.totalWorkdays,
      isPartial: summary.elapsedWorkdays < summary.totalWorkdays,
      isLoaded: summary.isLoaded,
    };
  });
  const team = monthly[monthly.length - 1];
  const previous = monthly.length > 1 && monthly[monthly.length - 2].isLoaded ? monthly[monthly.length - 2] : undefined;

  const projectSeconds = new Map<string, ProjectHours>();
  for (const { worklog, issue } of entries) {
    const project = projectSeconds.get(issue.projectKey) ?? {
      key: issue.projectKey,
      name: issue.projectName || issue.projectKey,
      seconds: 0,
      isSquad: squadKeys.has(issue.projectKey),
    };
    project.seconds += worklog.seconds;
    projectSeconds.set(issue.projectKey, project);
  }

  const allIssues = issueHours(entries);
  return {
    month: current.month,
    days,
    dayRanges,
    targetSeconds,
    elapsedWorkdays,
    totalWorkdays: current.totalWorkdays,
    lastWorkday,
    people,
    team: {
      seconds: team.seconds,
      expectedSeconds: team.expectedSeconds,
      coverage: team.coverage,
      previous: previous && { month: previous.month, coverage: previous.coverage },
      issuesWorked: allIssues.length,
      issuesDone: allIssues.filter(({ issue }) => issue.status.categoryKey === 'done').length,
      issuesInProgress: allIssues.filter(({ issue }) => issue.status.categoryKey === 'indeterminate').length,
    },
    daily,
    monthly,
    projects: [...projectSeconds.values()].sort((a, b) => b.seconds - a.seconds),
    topIssues: allIssues.slice(0, TOP_ISSUES),
    issues: allIssues.map(({ issue }) => issue),
  };
}
