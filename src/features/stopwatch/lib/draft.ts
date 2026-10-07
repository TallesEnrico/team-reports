import { formatTimeInTimeZone, isDateKey, toDateKeyInTimeZone, zonedDateTimeToInstant } from '@/lib/dates';
import { formDurationSeconds, type WorklogFormValues } from '@/lib/worklogForm';

interface ClockWorklog {
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  description: string;
}

const MAX_FORM_SECONDS = 24 * 60 * 60;

export type WorklogDraft =
  | { ok: true; values: WorklogFormValues }
  | { ok: false; error: string };

function sameMinute(start: string, end: string): boolean {
  const seconds = formDurationSeconds({ start, end });
  return seconds === null || seconds <= 0;
}

export function worklogDraftFromClock(payload: ClockWorklog, timeZone: string): WorklogDraft {
  if (payload.durationSeconds > MAX_FORM_SECONDS) {
    return { ok: false, error: 'A duração passa de 24 horas. Lance um trecho menor.' };
  }

  const started = new Date(payload.startedAt);
  const ended = new Date(payload.endedAt);
  const date = toDateKeyInTimeZone(started, timeZone);
  const endDay = toDateKeyInTimeZone(ended, timeZone);
  if (!isDateKey(date) || date !== endDay) {
    return { ok: false, error: 'O cronômetro passou da meia-noite. Lance as horas deste dia antes de continuar.' };
  }

  const start = formatTimeInTimeZone(started, timeZone);
  let end = formatTimeInTimeZone(ended, timeZone);
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
    return { ok: false, error: 'Não foi possível ler o horário do cronômetro.' };
  }

  if (sameMinute(start, end)) {
    const bumped = new Date(zonedDateTimeToInstant(date, start, timeZone).getTime() + 60_000);
    if (toDateKeyInTimeZone(bumped, timeZone) !== date) {
      return { ok: false, error: 'O cronômetro passou da meia-noite. Lance as horas deste dia antes de continuar.' };
    }
    end = formatTimeInTimeZone(bumped, timeZone);
    if (!/^\d{2}:\d{2}$/.test(end) || sameMinute(start, end)) {
      return { ok: false, error: 'O lançamento precisa de pelo menos um minuto.' };
    }
  }

  return {
    ok: true,
    values: {
      date,
      start,
      end,
      comment: payload.description.trim(),
    },
  };
}
