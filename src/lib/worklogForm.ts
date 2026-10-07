import type { WorklogEntry, WorklogInput } from '../api/jira-worklogs';
import { type DateKey, formatTimeInTimeZone, isDateKey, toDateKeyInTimeZone, todayKey, zonedDateTimeToInstant } from './dates';

/** Campos do formulário de horas; horários em HH:mm no fuso informado. */
export interface WorklogFormValues {
  date: DateKey;
  start: string;
  end: string;
  comment: string;
}

export function worklogEndInstant(worklog: Pick<WorklogEntry, 'started' | 'seconds'>): Date {
  return new Date(Date.parse(worklog.started) + worklog.seconds * 1000);
}

export function toWorklogFormValues(worklog: WorklogEntry, timeZone: string): WorklogFormValues {
  return {
    date: toDateKeyInTimeZone(worklog.started, timeZone),
    start: formatTimeInTimeZone(worklog.started, timeZone),
    end: formatTimeInTimeZone(worklogEndInstant(worklog), timeZone),
    comment: worklog.comment,
  };
}

/** Formulário de lançamento novo: hoje, com os horários em branco. */
export function emptyWorklogFormValues(timeZone: string): WorklogFormValues {
  return { date: todayKey(timeZone), start: '', end: '', comment: '' };
}

function minutesOfDay(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Duração entre início e fim, em segundos; `null` se algum horário estiver incompleto. */
export function formDurationSeconds(values: Pick<WorklogFormValues, 'start' | 'end'>): number | null {
  const start = minutesOfDay(values.start);
  const end = minutesOfDay(values.end);
  return start === null || end === null ? null : (end - start) * 60;
}

/** `input: null` quando nada mudou (só na edição). */
export type WorklogFormResult = { error: string } | { input: WorklogInput | null };

function readTimes(values: WorklogFormValues, timeZone: string): { error: string } | { started: Date; seconds: number } {
  if (!isDateKey(values.date)) return { error: 'Informe a data do apontamento.' };
  const duration = formDurationSeconds(values);
  if (duration === null) return { error: 'Informe a hora de início e a hora de fim.' };
  if (duration <= 0) return { error: 'A hora de fim deve ser depois da hora de início.' };
  return { started: zonedDateTimeToInstant(values.date, values.start, timeZone), seconds: duration };
}

/**
 * Valida a edição e monta a alteração; `input: null` quando nada mudou.
 * Data e horários sem mudança mantêm o início e a duração originais, que podem
 * ter segundos que o campo HH:mm não mostra.
 */
export function buildWorklogUpdate(
  worklog: WorklogEntry,
  initial: WorklogFormValues,
  values: WorklogFormValues,
  timeZone: string,
): WorklogFormResult {
  const timeChanged = values.date !== initial.date || values.start !== initial.start || values.end !== initial.end;
  const commentChanged = values.comment.trim() !== initial.comment.trim();
  if (!timeChanged && !commentChanged) return { input: null };

  let started = new Date(worklog.started);
  let seconds = worklog.seconds;

  if (timeChanged) {
    const times = readTimes(values, timeZone);
    if ('error' in times) return times;
    ({ started, seconds } = times);
  }

  return { input: { started, seconds, ...(commentChanged && { comment: values.comment.trim() }) } };
}

/** Valida um lançamento novo. */
export function buildNewWorklog(values: WorklogFormValues, timeZone: string): WorklogFormResult {
  const times = readTimes(values, timeZone);
  if ('error' in times) return times;
  const comment = values.comment.trim();
  return { input: { ...times, ...(comment && { comment }) } };
}
