import { type DateKey, endOfMonth, formatMonthYear, formatShortMonth } from '../../../lib/dates';
import type { MonthKey } from '../types';

export function monthOf(date: DateKey): MonthKey {
  return date.slice(0, 7);
}

export function addMonths(month: MonthKey, count: number): MonthKey {
  const [year, monthNumber] = month.split('-').map(Number);
  const index = year * 12 + (monthNumber - 1) + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function monthRange(month: MonthKey): { from: DateKey; to: DateKey } {
  const from = `${month}-01`;
  return { from, to: endOfMonth(from) };
}

/** O mês e os anteriores, do mês informado para trás (`count` meses ao todo). */
export function monthsUpTo(month: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, index) => addMonths(month, -index));
}

export function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** "setembro de 2026" */
export function formatMonthLong(month: MonthKey): string {
  return formatMonthYear(`${month}-01`);
}

/** "set" ou, quando os meses mostrados cruzam anos, "set/26". */
export function formatMonthShort(month: MonthKey, withYear = false): string {
  const name = formatShortMonth(`${month}-01`);
  return withYear ? `${name}/${month.slice(2, 4)}` : name;
}
