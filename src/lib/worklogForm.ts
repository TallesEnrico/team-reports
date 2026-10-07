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

const SPENT_PATTERN = /^(\d+(?:[.,]\d+)?\s*[hm]\s*)+$/i;

/** "2h 30m", "2h" ou "29m", em segundos. `null` se não for uma duração. */
export function parseSpentDuration(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || !SPENT_PATTERN.test(trimmed)) return null;
  let seconds = 0;
  for (const match of trimmed.matchAll(/(\d+(?:[.,]\d+)?)\s*([hm])/gi)) {
    const amount = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(amount)) return null;
    seconds += (match[2].toLowerCase() === 'h' ? 3600 : 60) * amount;
  }
  return Math.round(seconds);
}

/** Texto canônico da duração, ou o erro de formato. `null` se o campo estiver vazio. */
export function checkSpentDuration(value: string): { text: string; seconds: number } | { error: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/[hm]$/i.test(trimmed)) return { error: 'A duração deve terminar com h ou m, ex: 1h 10m ou 29m.' };
  const seconds = parseSpentDuration(trimmed);
  if (seconds === null) return { error: 'Informe a duração, ex: 2h 30m ou 29m.' };
  if (seconds <= 0) return { error: 'Informe uma duração maior que zero, ex: 2h 30m ou 29m.' };
  return { text: formatSpentDuration(seconds), seconds };
}

/** Duração em segundos no formato do campo ("2h 30m", "29m"). */
export function formatSpentDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes <= 0) return '';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** Hora de fim (HH:mm) somando a duração ao início, no mesmo dia. `null` se passar da meia-noite. */
export function endTimeAfter(start: string, seconds: number): string | null {
  const startMinutes = minutesOfDay(start);
  if (startMinutes === null || seconds <= 0) return null;
  const total = startMinutes + Math.round(seconds / 60);
  if (total >= 24 * 60) return null;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Horário atual (HH:mm) no fuso do lançamento. */
export function currentTimeValue(timeZone: string): string {
  return formatTimeInTimeZone(new Date(), timeZone);
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
