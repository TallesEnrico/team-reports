import { type DateKey, diffInDays } from '../../../lib/dates';
import { formatDuration } from '../../../lib/formatDuration';

const integerFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const listFormatter = new Intl.ListFormat('pt-BR', { type: 'conjunction' });

/** "7h 30m"; zero vira "0h". */
export function formatHours(seconds: number): string {
  return formatDuration(seconds, 'hours-minutes') || '0h';
}

/** Horas inteiras com separador de milhar ("1.234h"), para eixos e totais grandes. */
export function formatWholeHours(seconds: number): string {
  return `${integerFormatter.format(Math.round(seconds / 3600))}h`;
}

/** Totais da equipe: com minutos até 100h, depois só as horas. */
export function formatTotalHours(seconds: number): string {
  return seconds >= 100 * 3600 ? formatWholeHours(seconds) : formatHours(seconds);
}

export function formatPercent(ratio: number | undefined): string {
  return ratio === undefined ? '—' : `${integerFormatter.format(Math.round(ratio * 100))}%`;
}

/** Variação em pontos percentuais: "+3 p.p.", "−5 p.p.". */
export function formatPoints(delta: number): string {
  const points = Math.round(delta * 100);
  return `${points > 0 ? '+' : points < 0 ? '−' : ''}${Math.abs(points)} p.p.`;
}

/** "hoje", "ontem", "há 3 dias". */
export function formatDaysAgo(date: DateKey, today: DateKey): string {
  const days = diffInDays(date, today);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `há ${days} dias`;
}

export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "A, B e C". */
export function formatList(items: string[]): string {
  return listFormatter.format(items);
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${integerFormatter.format(count)} ${count === 1 ? singular : pluralForm}`;
}
