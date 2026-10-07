import { formatDayMonth } from '../../../lib/dates';
import type { TimeFormat } from '../../../lib/formatDuration';
import type { GroupBy, JiraField, PeriodGrouping, ReportFilters } from '../types';
import type { ColumnBand, PeriodColumn, ReportRow, ReportTable } from './buildReportTable';
import { formatFieldValue } from './formatFieldValue';

export type ExportFormat = 'pdf' | 'html' | 'xlsx';

export interface ExportRow {
  kind: 'group' | 'issue';
  isChild: boolean;
  label: string;
  secondary: string;
  href?: string;
  fields: string[];
  /** Segundos. */
  total: number;
  /** Segundos por coluna de período, na ordem de `periods`. */
  periods: number[];
}

/** Relatório já achatado para os exportadores: todas as linhas expandidas, sem estado de UI. */
export interface ExportModel {
  title: string;
  meta: string[];
  generatedAt: Date;
  fileBaseName: string;
  rowHeaderLabel: string;
  fieldNames: string[];
  periods: PeriodColumn[];
  /** Cabeçalho de período autocontido (com o mês nos dias), para formatos sem a faixa de meses. */
  periodHeaders: { primary: string; secondary: string }[];
  bands: ColumnBand[];
  rows: ExportRow[];
  totals: { total: number; periods: number[] };
  timeFormat: TimeFormat;
}

const ROW_HEADER_LABEL: Record<GroupBy, string> = {
  issue: 'Issue',
  parent: 'Issue pai',
  user: 'Pessoa',
  project: 'Projeto',
};

interface BuildExportModelOptions {
  table: ReportTable;
  fields: JiraField[];
  filters: Pick<ReportFilters, 'from' | 'to' | 'projectKeys'>;
  groupBy: GroupBy;
  period: PeriodGrouping;
  timeFormat: TimeFormat;
  meta: string[];
}

export function buildExportModel({ table, fields, filters, groupBy, period, timeFormat, meta }: BuildExportModelOptions): ExportModel {
  const toExportRow = (row: ReportRow, isChild: boolean): ExportRow => ({
    kind: row.kind,
    isChild,
    label: row.label,
    secondary: row.secondary ?? '',
    href: row.href,
    fields: fields.map((field) => (row.issue ? formatFieldValue(row.issue.fields[field.id], field) : '')),
    total: row.total,
    periods: table.columns.map((column) => row.cells[column.key] ?? 0),
  });

  const projects = filters.projectKeys.length > 0 ? filters.projectKeys.join('-') : 'todos';

  return {
    title: 'Team Reports',
    meta,
    generatedAt: new Date(),
    fileBaseName: `team-report_${projects}_${filters.from}_${filters.to}`.replace(/[^\w.-]+/g, '_'),
    rowHeaderLabel: ROW_HEADER_LABEL[groupBy],
    fieldNames: fields.map((field) => field.name),
    periods: table.columns,
    periodHeaders: table.columns.map((column) => ({
      primary: period === 'day' ? formatDayMonth(column.key) : column.label,
      secondary: column.sublabel,
    })),
    bands: table.bands,
    rows: table.rows.flatMap((row) => [toExportRow(row, false), ...(row.children ?? []).map((child) => toExportRow(child, true))]),
    totals: { total: table.grandTotal, periods: table.columns.map((column) => table.columnTotals[column.key] ?? 0) },
    timeFormat,
  };
}

const generatedAtFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function formatGeneratedAt(date: Date): string {
  return `Gerado em ${generatedAtFormatter.format(date)}`;
}
