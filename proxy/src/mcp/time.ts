/** Data de calendário `YYYY-MM-DD`; as contas são feitas em UTC, sem horário de verão. */
export type DateKey = string;

const DAY_MS = 86_400_000;

export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(key: DateKey, days: number): DateKey {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function diffInDays(from: DateKey, to: DateKey): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** O fuso existe (ex: America/Sao_Paulo)? */
export function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Deslocamento do fuso no instante, em minutos (ex: -180 para UTC-3). */
function offsetMinutes(timeZone: string, at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')?.value;
  if (!name || name === 'GMT') return 0;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

/** Instante de uma data e hora (HH:MM) de calendário no fuso. */
export function zonedToInstant(date: DateKey, time: string, timeZone: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const wallClockAsUtc = Date.parse(`${date}T00:00:00Z`) + (hours * 60 + minutes) * 60_000;
  // O deslocamento depende do próprio instante: estima e confere uma vez.
  const guess = offsetMinutes(timeZone, new Date(wallClockAsUtc));
  const offset = offsetMinutes(timeZone, new Date(wallClockAsUtc - guess * 60_000));
  return new Date(wallClockAsUtc - offset * 60_000);
}

/** Data (`YYYY-MM-DD`) e hora (`HH:MM`) de um instante no fuso. */
export function inZone(instant: string | Date, timeZone: string): { date: DateKey; time: string } {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  return { date: day, time };
}

/** Hoje no fuso. */
export function todayIn(timeZone: string): DateKey {
  return inZone(new Date(), timeZone).date;
}

/** Formato que o Jira aceita em `started` (o `Z` do ISO não é aceito). */
export function toJiraDateTime(date: Date): string {
  return date.toISOString().replace('Z', '+0000');
}

/** "7h 30m", "45m". */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "segunda", "terça"… */
export function weekdayName(key: DateKey): string {
  return WEEKDAYS[new Date(`${key}T00:00:00Z`).getUTCDay()];
}
