// Datas de calendário são tratadas como strings `YYYY-MM-DD` (DateKey) e a
// aritmética é feita em UTC, para não sofrer com horário de verão do navegador.
export type DateKey = string;

const DAY_MS = 86_400_000;

export function parseDateKey(key: DateKey): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function toDateKey(date: Date): DateKey {
  return date.toISOString().slice(0, 10);
}

export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // `Date.UTC` "corrige" datas impossíveis (2026-13-40 vira 2027); exige ida e volta idêntica.
  const date = parseDateKey(value);
  return !Number.isNaN(date.getTime()) && toDateKey(date) === value;
}

export function addDays(key: DateKey, days: number): DateKey {
  return toDateKey(new Date(parseDateKey(key).getTime() + days * DAY_MS));
}

export function diffInDays(from: DateKey, to: DateKey): number {
  return Math.round((parseDateKey(to).getTime() - parseDateKey(from).getTime()) / DAY_MS);
}

export function eachDay(from: DateKey, to: DateKey): DateKey[] {
  const days: DateKey[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

/** 0 = domingo … 6 = sábado */
export function weekdayOf(key: DateKey): number {
  return parseDateKey(key).getUTCDay();
}

export function isWeekend(key: DateKey): boolean {
  const weekday = weekdayOf(key);
  return weekday === 0 || weekday === 6;
}

/** Segunda-feira da semana ISO que contém a data. */
export function isoWeekStart(key: DateKey): DateKey {
  return addDays(key, -((weekdayOf(key) + 6) % 7));
}

/** Semana ISO (segunda a domingo) que contém a data. */
export function isoWeekRange(key: DateKey): { from: DateKey; to: DateKey } {
  const from = isoWeekStart(key);
  return { from, to: addDays(from, 6) };
}

export function isoWeekNumber(key: DateKey): number {
  // A semana ISO pertence ao ano da sua quinta-feira.
  const thursday = parseDateKey(addDays(isoWeekStart(key), 3));
  const firstDayOfYear = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - firstDayOfYear) / DAY_MS / 7) + 1;
}

export function startOfMonth(key: DateKey): DateKey {
  return `${key.slice(0, 7)}-01`;
}

export function endOfMonth(key: DateKey): DateKey {
  const date = parseDateKey(startOfMonth(key));
  return toDateKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

const dateKeyFormatters = new Map<string, Intl.DateTimeFormat>();

/** Data de calendário de um instante no fuso informado. */
export function toDateKeyInTimeZone(instant: string | Date, timeZone: string): DateKey {
  let formatter = dateKeyFormatters.get(timeZone);
  if (!formatter) {
    // en-CA formata como YYYY-MM-DD.
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    dateKeyFormatters.set(timeZone, formatter);
  }
  return formatter.format(typeof instant === 'string' ? new Date(instant) : instant);
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

/** Hora (HH:mm, 24h) de um instante no fuso informado. */
export function formatTimeInTimeZone(instant: string | Date, timeZone: string): string {
  let formatter = timeFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    timeFormatters.set(timeZone, formatter);
  }
  return formatter.format(typeof instant === 'string' ? new Date(instant) : instant);
}

/** Instante de uma data e hora (HH:mm) de calendário no fuso informado. */
export function zonedDateTimeToInstant(date: DateKey, time: string, timeZone: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const wallClockAsUtc = parseDateKey(date).getTime() + (hours * 60 + minutes) * 60_000;
  // O deslocamento depende do próprio instante (horário de verão): estima com a
  // hora lida como UTC e confere uma vez com o instante resultante.
  const guess = utcOffsetMinutes(timeZone, new Date(wallClockAsUtc)) ?? 0;
  const offset = utcOffsetMinutes(timeZone, new Date(wallClockAsUtc - guess * 60_000)) ?? guess;
  return new Date(wallClockAsUtc - offset * 60_000);
}

export function todayKey(timeZone: string = browserTimeZone()): DateKey {
  return toDateKeyInTimeZone(new Date(), timeZone);
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Deslocamento UTC do fuso no instante informado, em minutos (ex: -180 para UTC-3); `null` se o fuso for inválido. */
export function utcOffsetMinutes(timeZone: string, at: Date = new Date()): number | null {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value;
    if (name === 'GMT') return 0;
    const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name ?? '');
    if (!match) return null;
    const minutes = Number(match[2]) * 60 + Number(match[3]);
    return match[1] === '-' ? -minutes : minutes;
  } catch {
    return null;
  }
}

/** dd/mm */
export function formatDayMonth(key: DateKey): string {
  return `${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

/** dd/mm/aaaa */
export function formatDateBR(key: DateKey): string {
  return `${formatDayMonth(key)}/${key.slice(0, 4)}`;
}

const monthYearFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortMonthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' });

/** "setembro de 2026" */
export function formatMonthYear(key: DateKey): string {
  return monthYearFormatter.format(parseDateKey(key));
}

/** "set" */
export function formatShortMonth(key: DateKey): string {
  return shortMonthFormatter.format(parseDateKey(key)).replace('.', '');
}

const WEEKDAY_LABELS = ['Dom', '2ª', '3ª', '4ª', '5ª', '6ª', 'Sáb'];

/** Abreviação de dia da semana usada no Brasil: "2ª", "3ª", …, "Sáb", "Dom". */
export function formatWeekdayShort(key: DateKey): string {
  return WEEKDAY_LABELS[weekdayOf(key)];
}

const WEEKDAY_LONG_LABELS = ['Domingo', '2ª feira', '3ª feira', '4ª feira', '5ª feira', '6ª feira', 'Sábado'];

/** Dia da semana por extenso: "2ª feira", …, "Sábado", "Domingo". */
export function formatWeekdayLong(key: DateKey): string {
  return WEEKDAY_LONG_LABELS[weekdayOf(key)];
}
