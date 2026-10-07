import type { ReportFilters } from '../types';

/** Igualdade por valor (os filtros são objetos pequenos e serializáveis). */
export function areFiltersEqual(a: ReportFilters, b: ReportFilters): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
