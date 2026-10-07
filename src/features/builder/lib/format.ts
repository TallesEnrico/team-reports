import { formatDuration } from '../../../lib/formatDuration';

const integerFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export type MeasureUnit = 'duration' | 'count';

/** "7h 30m" (até 100h; depois só as horas, "1.234h"); contagens com separador de milhar. */
export function formatValue(value: number, unit: MeasureUnit): string {
  if (unit === 'count') return Number.isInteger(value) ? integerFormatter.format(value) : decimalFormatter.format(value);
  if (value >= 100 * 3600) return `${integerFormatter.format(Math.round(value / 3600))}h`;
  return formatDuration(value, 'hours-minutes') || '0h';
}

/** Valor curto para eixos e prévias: "12h", "1,5h", "340". */
export function formatAxisValue(value: number, unit: MeasureUnit): string {
  if (unit === 'count') return integerFormatter.format(value);
  return `${decimalFormatter.format(value)}h`;
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${integerFormatter.format(count)} ${count === 1 ? singular : pluralForm}`;
}

const listFormatter = new Intl.ListFormat('pt-BR', { type: 'conjunction' });

/** "A, B e C". */
export function formatList(items: string[]): string {
  return listFormatter.format(items);
}

/** Primeira letra minúscula, para compor títulos ("Horas por pessoa"). */
export function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
