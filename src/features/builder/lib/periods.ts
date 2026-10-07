import {
  addDays,
  type DateKey,
  endOfMonth,
  formatDateBR,
  formatDayMonth,
  isDateKey,
  isoWeekStart,
  startOfMonth,
} from '../../../lib/dates';
import type { DateRange, PeriodConfig, PeriodPreset } from '../types';

/** O período padrão do dashboard (dashboards novos e os de antes do seletor). */
export const DEFAULT_DASHBOARD_PERIOD: PeriodConfig = { preset: 'this-month', from: null, to: null };

/** Atalhos do período do dashboard (e de uma peça com período próprio). */
export const PERIOD_OPTIONS: { value: Exclude<PeriodPreset, 'dashboard'>; label: string }[] = [
  { value: 'this-week', label: 'Esta semana' },
  { value: 'last-week', label: 'Semana passada' },
  { value: 'this-month', label: 'Este mês' },
  { value: 'last-month', label: 'Mês passado' },
  { value: 'last-7', label: 'Últimos 7 dias' },
  { value: 'last-30', label: 'Últimos 30 dias' },
  { value: 'last-90', label: 'Últimos 90 dias' },
  { value: 'custom', label: 'De… até…' },
];

/** Períodos longos pesam: cada issue com mais de 20 apontamentos é uma requisição a mais. */
export const MAX_PERIOD_DAYS = 366;

function isPlausibleYear(date: DateKey): boolean {
  const year = Number(date.slice(0, 4));
  return year >= 2000 && year <= 2100;
}

/**
 * As datas do período, com `today` no fuso da tela; `null` com "De… até…"
 * incompleto, invertido ou de ano impossível. `'dashboard'` usa o período do
 * dashboard (`dashboardPeriod`).
 */
export function resolvePeriod(period: PeriodConfig, today: DateKey, dashboardPeriod?: PeriodConfig): DateRange | null {
  switch (period.preset) {
    case 'dashboard':
      return dashboardPeriod?.preset === 'dashboard' ? null : resolvePeriod(dashboardPeriod ?? DEFAULT_DASHBOARD_PERIOD, today);
    case 'this-week':
      return { from: isoWeekStart(today), to: today };
    case 'last-week': {
      const from = addDays(isoWeekStart(today), -7);
      return { from, to: addDays(from, 6) };
    }
    case 'this-month':
      return { from: startOfMonth(today), to: today };
    case 'last-month': {
      const from = startOfMonth(addDays(startOfMonth(today), -1));
      return { from, to: endOfMonth(from) };
    }
    case 'last-7':
      return { from: addDays(today, -6), to: today };
    case 'last-30':
      return { from: addDays(today, -29), to: today };
    case 'last-90':
      return { from: addDays(today, -89), to: today };
    case 'custom': {
      const { from, to } = period;
      if (!from || !to || !isDateKey(from) || !isDateKey(to) || from > to) return null;
      // Enquanto o ano é digitado, o campo passa por 0002, 0020…: nada de buscar o Jira com isso.
      if (!isPlausibleYear(from) || !isPlausibleYear(to)) return null;
      return { from, to };
    }
  }
}

export function periodLabel(period: PeriodConfig, dashboardPeriod?: PeriodConfig): string {
  if (period.preset === 'dashboard') {
    return dashboardPeriod && dashboardPeriod.preset !== 'dashboard' ? periodLabel(dashboardPeriod) : 'O do dashboard';
  }
  if (period.preset === 'custom') {
    return period.from && period.to ? `${formatDateBR(period.from)} a ${formatDateBR(period.to)}` : 'Período incompleto';
  }
  return PERIOD_OPTIONS.find((option) => option.value === period.preset)?.label ?? '';
}

/** "01/10 a 31/10" (com o ano quando o período cruza anos). */
export function rangeLabel(range: DateRange): string {
  if (range.from === range.to) return formatDateBR(range.from);
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  return sameYear
    ? `${formatDayMonth(range.from)} a ${formatDayMonth(range.to)}`
    : `${formatDateBR(range.from)} a ${formatDateBR(range.to)}`;
}
