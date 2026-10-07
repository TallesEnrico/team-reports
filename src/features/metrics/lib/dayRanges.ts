import type { DayRanges } from '../types';
import type { DayStatus } from './buildMetrics';
import { formatHours } from './format';

const HOUR = 3600;

/** Vermelho abaixo de 4h, amarelo até abaixo de 4h (nenhum), verde até a jornada de 8h e azul acima. */
export const DEFAULT_DAY_RANGES: DayRanges = { danger: 4 * HOUR, alert: 4 * HOUR, success: 8 * HOUR };

/** Limites oferecidos na lateral: de meia em meia hora, até 12h. */
export const DAY_RANGE_OPTIONS = Array.from({ length: 24 }, (_, index) => (index + 1) * (HOUR / 2));

/** Troca um limite e empurra os outros para manter `danger <= alert <= success`. */
export function withDayRange(ranges: DayRanges, key: keyof DayRanges, seconds: number): DayRanges {
  const next = { ...ranges, [key]: seconds };
  if (key === 'success') {
    next.alert = Math.min(next.alert, seconds);
    next.danger = Math.min(next.danger, next.alert);
  } else if (key === 'alert') {
    next.danger = Math.min(next.danger, seconds);
    next.success = Math.max(next.success, seconds);
  } else {
    next.alert = Math.max(next.alert, seconds);
    next.success = Math.max(next.success, next.alert);
  }
  return next;
}

export const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  danger: 'Bem abaixo da jornada',
  alert: 'Abaixo da jornada',
  success: 'Na jornada',
  over: 'Acima da jornada',
  missing: 'Dia útil sem lançamento',
  off: 'Sem jornada esperada',
  pending: 'Dia ainda não terminou',
};

/** Marca de cada situação nas legendas e nos tooltips (a mesma cor da colunazinha do dia). */
export const DAY_STATUS_MARKS = {
  danger: 'danger',
  alert: 'alert',
  success: 'success',
  over: 'bar',
  missing: 'empty',
  off: 'bar',
  pending: 'muted-bar',
} as const satisfies Record<DayStatus, string>;

export type ScaleStatus = 'danger' | 'alert' | 'success' | 'over';

const SCALE: readonly DayStatus[] = ['danger', 'alert', 'success', 'over'] satisfies ScaleStatus[];

function isScaleStatus(status: DayStatus): status is ScaleStatus {
  return SCALE.includes(status);
}

/** Faixas da escala, em ordem; a amarela some quando o limite dela é o do vermelho (não sobra hora para ela). */
export function dayScale(ranges: DayRanges): ScaleStatus[] {
  return (['danger', 'alert', 'success', 'over'] as const).filter(
    (status) => status !== 'alert' || ranges.alert > ranges.danger,
  );
}

/** As horas de uma faixa: "menos de 4h", "4h a 6h", "6h a 8h", "mais de 8h". */
export function dayRangeText(status: ScaleStatus, ranges: DayRanges): string {
  switch (status) {
    case 'danger':
      return `menos de ${formatHours(ranges.danger)}`;
    case 'alert':
      return `${formatHours(ranges.danger)} a ${formatHours(ranges.alert)}`;
    case 'success':
      return ranges.alert === ranges.success
        ? formatHours(ranges.success)
        : `${formatHours(ranges.alert)} a ${formatHours(ranges.success)}`;
    case 'over':
      return `mais de ${formatHours(ranges.success)}`;
  }
}

/** Nota do dia nos tooltips: a situação e, nas faixas, as horas dela ("Abaixo da jornada · 4h a 6h"). */
export function dayStatusNote(status: DayStatus, ranges: DayRanges): string {
  const label = DAY_STATUS_LABELS[status];
  return isScaleStatus(status) ? `${label} · ${dayRangeText(status, ranges)}` : label;
}
