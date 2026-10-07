import { useMemo } from 'react';
import { todayKey } from '../../../lib/dates';
import { buildReportTable, type ReportTable } from '../lib/buildReportTable';
import type { ReportDisplay, WorklogReport } from '../types';

/**
 * Matriz linhas × períodos do relatório. Usa o período com que o relatório foi
 * buscado (e não o dos filtros aplicados) para que dados antigos exibidos durante
 * um refetch continuem coerentes com as colunas.
 */
export function useReportTable(
  report: WorklogReport | undefined,
  display: Pick<ReportDisplay, 'groupBy' | 'period'>,
  timeZone: string,
): ReportTable | undefined {
  const { groupBy, period } = display;

  return useMemo(() => {
    if (!report) return undefined;
    const { from, to } = report.filters;
    return buildReportTable(report, { from, to, groupBy, period, timeZone, today: todayKey(timeZone) });
  }, [report, groupBy, period, timeZone]);
}
