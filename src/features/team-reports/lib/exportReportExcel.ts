import writeXlsxFile, { type CellObject, type Row } from 'write-excel-file/browser';
import { downloadBlob } from '../../../lib/downloadFile';
import type { TimeFormat } from '../../../lib/formatDuration';
import { type ExportModel, type ExportRow, formatGeneratedAt } from './buildExportModel';

// O Excel não tem transparência: #fff0b399 sobre branco resulta em #FFF6D1.
const COLORS = {
  header: '#F7F6F3',
  headerText: '#787774',
  text: '#2F3437',
  strong: '#111111',
  faint: '#A5A4A0',
  border: '#EAEAEA',
  borderStrong: '#D9D8D4',
  total: '#FFF6D1',
  weekend: '#FAF9F7',
  weekendDark: '#F1F0EC',
};

// Horas vão como número (fração de dia ou horas decimais) para continuarem somáveis
// no Excel. "Horas e minutos" também usa [h]:mm: formatos com texto literal, como
// [h]"h" mm"m", são lidos errado por alguns visualizadores (ex: Quick Look/Numbers).
const DURATION_FORMATS: Record<TimeFormat, { divisor: number; format: string }> = {
  'hours-minutes': { divisor: 86_400, format: '[h]:mm' },
  clock: { divisor: 86_400, format: '[h]:mm' },
  decimal: { divisor: 3_600, format: '0.00' },
};

type CellStyle = Omit<CellObject, 'value' | 'type'>;

const periodSeparator: CellStyle = { rightBorderColor: COLORS.border, rightBorderStyle: 'thin' };

function durationCell(seconds: number, timeFormat: TimeFormat, style: CellStyle): CellObject {
  const { divisor, format } = DURATION_FORMATS[timeFormat];
  const base: CellStyle = { align: 'center', alignVertical: 'center', ...style };
  return seconds ? { value: seconds / divisor, type: Number, format, ...base } : base;
}

function textCell(value: string, style: CellStyle = {}): CellObject {
  return { value, type: String, alignVertical: 'center', ...style };
}

export async function exportReportExcel(model: ExportModel): Promise<void> {
  const { timeFormat } = model;
  const headerStyle: CellStyle = {
    fontWeight: 'bold',
    textColor: COLORS.headerText,
    backgroundColor: COLORS.header,
    alignVertical: 'center',
    bottomBorderColor: COLORS.borderStrong,
    bottomBorderStyle: 'thin',
  };
  const periodBackground = (index: number, dark: boolean) =>
    model.periods[index].isWeekend ? (dark ? COLORS.weekendDark : COLORS.weekend) : undefined;

  const fixedColumns = 2 + model.fieldNames.length + 1; // rótulo, resumo, campos extras, total

  const bandRow: Row = [
    textCell(model.rowHeaderLabel, { ...headerStyle, rowSpan: 2 }),
    textCell('Resumo', { ...headerStyle, rowSpan: 2 }),
    ...model.fieldNames.map((name) => textCell(name, { ...headerStyle, rowSpan: 2, ...periodSeparator })),
    textCell('Total', { ...headerStyle, rowSpan: 2, align: 'center', backgroundColor: COLORS.total, ...periodSeparator }),
    ...model.bands.flatMap((band) => [
      textCell(band.label, { ...headerStyle, columnSpan: band.span, ...periodSeparator }),
      ...Array<null>(band.span - 1).fill(null),
    ]),
  ];

  const periodRow: Row = [
    ...Array<null>(fixedColumns).fill(null),
    ...model.periods.map((period, index) =>
      textCell(`${period.label} ${period.sublabel}`, {
        ...headerStyle,
        ...periodSeparator,
        align: 'center',
        backgroundColor: periodBackground(index, true) ?? COLORS.header,
      }),
    ),
  ];

  const toRow = (row: ExportRow): Row => {
    const isGroup = row.kind === 'group';
    const rowStyle: CellStyle = isGroup
      ? { fontWeight: 'bold', textColor: COLORS.strong, backgroundColor: COLORS.header }
      : { textColor: COLORS.text };
    const border: CellStyle = { bottomBorderColor: COLORS.border, bottomBorderStyle: 'thin' };
    return [
      textCell(row.label, { ...rowStyle, ...border, ...(row.isChild ? { indent: 2 } : {}) }),
      textCell(row.secondary, { ...rowStyle, ...border, textColor: isGroup ? COLORS.strong : COLORS.headerText }),
      ...row.fields.map((value) => textCell(value, { ...rowStyle, ...border, ...periodSeparator })),
      durationCell(row.total, timeFormat, { ...rowStyle, ...border, ...periodSeparator, fontWeight: 'bold', backgroundColor: COLORS.total }),
      ...row.periods.map((seconds, index) =>
        durationCell(seconds, timeFormat, {
          ...rowStyle,
          ...border,
          ...periodSeparator,
          backgroundColor: periodBackground(index, isGroup) ?? rowStyle.backgroundColor,
        }),
      ),
    ];
  };

  const footStyle: CellStyle = {
    fontWeight: 'bold',
    textColor: COLORS.strong,
    backgroundColor: COLORS.header,
    topBorderColor: COLORS.borderStrong,
    topBorderStyle: 'thin',
  };
  const totalRow: Row = [
    textCell('Total', footStyle),
    textCell('', footStyle),
    ...model.fieldNames.map(() => textCell('', { ...footStyle, ...periodSeparator })),
    durationCell(model.totals.total, timeFormat, { ...footStyle, ...periodSeparator, backgroundColor: COLORS.total }),
    ...model.totals.periods.map((seconds, index) =>
      durationCell(seconds, timeFormat, { ...footStyle, ...periodSeparator, backgroundColor: periodBackground(index, true) ?? COLORS.header }),
    ),
  ];

  const titleRows: Row[] = [
    [textCell(model.title, { fontWeight: 'bold', fontSize: 16, textColor: COLORS.strong })],
    [textCell(model.meta.join(' · '), { textColor: COLORS.headerText })],
    [textCell(formatGeneratedAt(model.generatedAt), { textColor: COLORS.faint, fontSize: 9 })],
    [],
  ];

  const data: Row[] = [...titleRows, bandRow, periodRow, ...model.rows.map(toRow), totalRow];
  const labelWidth = Math.min(40, Math.max(12, ...model.rows.map((row) => row.label.length + (row.isChild ? 4 : 0))));

  const blob = await writeXlsxFile(data, {
    sheet: 'Apontamentos',
    columns: [
      { width: labelWidth },
      { width: 60 },
      ...model.fieldNames.map(() => ({ width: 22 })),
      { width: 11 },
      ...model.periods.map(() => ({ width: 9 })),
    ],
    stickyRowsCount: titleRows.length + 2,
    stickyColumnsCount: 1,
    showGridLines: false,
  }).toBlob();

  downloadBlob(`${model.fileBaseName}.xlsx`, blob);
}
