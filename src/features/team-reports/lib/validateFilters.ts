import { diffInDays, isDateKey } from '../../../lib/dates';
import type { ReportFilters } from '../types';

export const MAX_RANGE_DAYS = 366;

/** Mensagem do primeiro problema encontrado, ou `null` se os filtros são válidos. */
export function validateFilters(filters: ReportFilters): string | null {
  if (!isDateKey(filters.from) || !isDateKey(filters.to)) return 'Informe as datas De e Até.';
  if (filters.from > filters.to) return 'A data De precisa ser anterior ou igual à data Até.';
  if (diffInDays(filters.from, filters.to) >= MAX_RANGE_DAYS) return `O período pode ter no máximo ${MAX_RANGE_DAYS} dias.`;
  return null;
}
