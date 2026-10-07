import { jsPDF } from 'jspdf';
import { autoTable, type CellHookData, type RowInput } from 'jspdf-autotable';
import { downloadBlob } from '../../../lib/downloadFile';
import { formatDuration } from '../../../lib/formatDuration';
import { type ExportModel, formatGeneratedAt } from './buildExportModel';

type Rgb = [number, number, number];

// #fff0b399 sobre branco = rgb(255, 246, 209); o PDF não tem transparência na tabela.
const RGB = {
  text: [47, 52, 55],
  strong: [17, 17, 17],
  muted: [120, 119, 116],
  faint: [165, 164, 160],
  header: [247, 246, 243],
  border: [234, 234, 234],
  borderStrong: [217, 216, 212],
  total: [255, 246, 209],
  weekend: [250, 249, 247],
  weekendDark: [241, 240, 236],
} satisfies Record<string, Rgb>;

const MARGIN = 28;
const TOTAL_PAGES_PLACEHOLDER = '{total_pages}';

/** As fontes padrão do PDF só cobrem Latin-1; troca pontuação tipográfica e descarta o resto. */
function pdfText(value: string): string {
  return value
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/›/g, '>')
    .replace(/[^\u0000-ÿ]/g, '?');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function exportReportPdf(model: ExportModel): Promise<void> {
  const format = (seconds: number) => formatDuration(seconds, model.timeFormat);
  const isLarge = model.periods.length + model.fieldNames.length > 18;
  const fontSize = model.periods.length > 25 ? 6.5 : isLarge ? 7 : 7.5;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: isLarge ? 'a3' : 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...RGB.strong);
  doc.text(model.title, MARGIN, MARGIN + 14);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...RGB.muted);
  doc.text(pdfText(model.meta.join('  ·  ')), MARGIN, MARGIN + 30);

  const totalIndex = 2 + model.fieldNames.length;
  const firstPeriodIndex = totalIndex + 1;
  const lastIndex = firstPeriodIndex + model.periods.length - 1;

  // Larguras calculadas para a tabela caber na página: as colunas de período
  // dividem o espaço que sobra e o resumo absorve a folga. Valores longos
  // (ex: totais do rodapé) quebram em duas linhas em vez de estourar a margem.
  doc.setFont('helvetica', 'bold').setFontSize(fontSize);
  const textWidth = (text: string) => doc.getTextWidth(text);
  const available = pageWidth - 2 * MARGIN;
  const labelWidth = clamp(
    Math.max(...model.rows.map((row) => textWidth(pdfText(row.label)) + (row.isChild ? 10 : 0))) + 10,
    56,
    isLarge ? 130 : 110,
  );
  const totalWidth = Math.max(40, textWidth(format(model.totals.total)) + 10);
  const fieldWidth = 64;
  const periodValues = [...model.rows.flatMap((row) => row.periods), ...model.totals.periods].map(format);
  const longestWord = Math.max(...periodValues.flatMap((value) => value.split(' ')).map(textWidth), textWidth('00/00'));
  const periodMin = Math.max(20, longestWord + 6);
  const fixedWidth = labelWidth + fieldWidth * model.fieldNames.length + totalWidth;
  const summaryWidth = clamp(available - fixedWidth - periodMin * model.periods.length, 90, isLarge ? 240 : 190);
  // Arredondado para baixo: uma soma que passe do disponível por ponto flutuante
  // empurraria a última coluna para outra página.
  const periodWidth = Math.floor(Math.max(periodMin, (available - fixedWidth - summaryWidth) / model.periods.length) * 100) / 100;
  const columnWidths = [
    labelWidth,
    summaryWidth,
    ...model.fieldNames.map(() => fieldWidth),
    totalWidth,
    ...model.periods.map(() => periodWidth),
  ];

  // Uma linha de cabeçalho só (o mês vai em cada dia): células mescladas vazam
  // da página se a tabela ainda precisar de quebra horizontal.
  const head: RowInput[] = [
    [
      model.rowHeaderLabel,
      'Resumo',
      ...model.fieldNames.map(pdfText),
      'Total',
      ...model.periodHeaders.map((header) => pdfText(`${header.primary}\n${header.secondary}`)),
    ],
  ];

  const body: RowInput[] = model.rows.map((row) => [
    pdfText(row.label),
    pdfText(row.secondary),
    ...row.fields.map(pdfText),
    format(row.total),
    ...row.periods.map(format),
  ]);

  const foot: RowInput[] = [
    ['Total', '', ...model.fieldNames.map(() => ''), format(model.totals.total), ...model.totals.periods.map(format)],
  ];

  function styleCell({ cell, column, row, section }: CellHookData) {
    const index = column.index;
    const exportRow = section === 'body' ? model.rows[row.index] : undefined;
    const isDarkRow = section !== 'body' || exportRow?.kind === 'group';
    const baseLine = section === 'foot' ? { top: 0.75 } : { bottom: section === 'head' ? 0.75 : 0.5 };

    // Largura fixa em todas as seções: `columnStyles` só vale para o corpo, e o
    // cálculo de quebra horizontal usaria a largura natural do cabeçalho/rodapé.
    cell.styles.cellWidth = columnWidths[index];

    // Linha vertical entre dias (e após campos extras e total), como na tela.
    cell.styles.lineWidth = index >= 2 && index < lastIndex ? { ...baseLine, right: 0.5 } : baseLine;
    if (index >= 2) cell.styles.halign = index < totalIndex ? 'left' : 'center';

    if (exportRow?.kind === 'group') {
      cell.styles.fontStyle = 'bold';
      cell.styles.textColor = RGB.strong;
      cell.styles.fillColor = RGB.header;
    }
    if (exportRow?.isChild && index === 0) cell.styles.cellPadding = { top: 4, bottom: 4, left: 13, right: 3 };
    if (section === 'body' && index === 1 && exportRow?.kind === 'issue') cell.styles.textColor = RGB.muted;

    const period = index >= firstPeriodIndex ? model.periods[index - firstPeriodIndex] : undefined;
    if (period?.isWeekend) cell.styles.fillColor = isDarkRow ? RGB.weekendDark : RGB.weekend;

    if (index === totalIndex) {
      cell.styles.fillColor = RGB.total;
      cell.styles.fontStyle = 'bold';
      cell.styles.textColor = RGB.strong;
    }
  }

  autoTable(doc, {
    head,
    body,
    foot,
    startY: MARGIN + 44,
    margin: { top: MARGIN, right: MARGIN, bottom: MARGIN + 12, left: MARGIN },
    theme: 'plain',
    showHead: 'everyPage',
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
    horizontalPageBreak: true,
    horizontalPageBreakRepeat: 0,
    styles: {
      font: 'helvetica',
      fontSize,
      textColor: RGB.text,
      lineColor: RGB.border,
      cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
      valign: 'middle',
      halign: 'center',
      overflow: 'linebreak',
    },
    headStyles: { fillColor: RGB.header, textColor: RGB.muted, fontStyle: 'bold', lineColor: RGB.borderStrong },
    footStyles: { fillColor: RGB.header, textColor: RGB.strong, fontStyle: 'bold', lineColor: RGB.borderStrong },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'left' },
    },
    didParseCell: styleCell,
    didDrawCell: ({ cell, column, row, section }) => {
      const href = section === 'body' && column.index === 0 ? model.rows[row.index]?.href : undefined;
      if (href) doc.link(cell.x, cell.y, cell.width, cell.height, { url: href });
    },
    didDrawPage: ({ pageNumber }) => {
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...RGB.faint);
      doc.text(pdfText(formatGeneratedAt(model.generatedAt)), MARGIN, pageHeight - MARGIN / 2);
      doc.text(`Página ${pageNumber} de ${TOTAL_PAGES_PLACEHOLDER}`, pageWidth - MARGIN, pageHeight - MARGIN / 2, { align: 'right' });
    },
  });

  doc.putTotalPages(TOTAL_PAGES_PLACEHOLDER);
  downloadBlob(`${model.fileBaseName}.pdf`, doc.output('blob'));
}
