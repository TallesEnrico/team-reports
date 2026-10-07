import { downloadBlob } from '../../../lib/downloadFile';
import { formatDuration } from '../../../lib/formatDuration';
import { type ExportModel, type ExportRow, formatGeneratedAt } from './buildExportModel';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function classes(...names: (string | false)[]): string {
  const list = names.filter(Boolean).join(' ');
  return list ? ` class="${list}"` : '';
}

// Mesmo visual da tabela na tela, só com fontes do sistema para o arquivo abrir offline.
const STYLES = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px; background: #fbfbfa; color: #2f3437; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }
h1 { margin: 0 0 6px; font: 500 32px/1.1 Georgia, 'Times New Roman', serif; letter-spacing: -0.02em; color: #111; }
.meta, footer { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; color: #787774; }
.meta { margin: 0 0 24px; }
footer { margin-top: 12px; color: #a5a4a0; }
.wrap { overflow: auto; max-height: calc(100vh - 170px); border: 1px solid #eaeaea; border-radius: 10px; background: #fff; }
table { width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 0; }
th, td { height: 38px; padding: 0 10px; border-bottom: 1px solid #eaeaea; background-color: #fff; font-weight: 400; text-align: left; white-space: nowrap; }
thead th { position: sticky; top: 0; z-index: 2; height: 30px; font: 500 10.5px/1.3 ui-monospace, 'SF Mono', Menlo, Consolas, monospace; letter-spacing: 0.06em; text-transform: uppercase; color: #787774; }
thead tr + tr th { top: 30px; height: 44px; }
.band, .field, .period { border-right: 1px solid #eaeaea; }
.band:last-child, .period:last-child { border-right: none; }
thead .period { min-width: 58px; text-align: center; }
.period-label { display: block; font: 600 13px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; letter-spacing: 0; text-transform: none; color: #111; }
.period-sub { display: block; letter-spacing: 0.02em; text-transform: none; }
.label { position: sticky; left: 0; z-index: 1; max-width: 460px; overflow: hidden; text-overflow: ellipsis; }
thead .label, tfoot .label { z-index: 3; }
.key { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12.5px; color: #111; text-decoration: none; }
a.key:hover { text-decoration: underline; }
.secondary { margin-left: 8px; color: #787774; }
.child .label { padding-left: 34px; }
.group > * { background-color: #f7f6f3; }
.group .label { font-weight: 600; color: #111; }
.num { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12.5px; font-variant-numeric: tabular-nums; text-align: center; }
thead .total { font-size: 10.5px; }
.total { border-right: 1px solid #eaeaea; background-image: linear-gradient(#fff0b399, #fff0b399); font-weight: 600; color: #111; }
.weekend { background-color: #faf9f7; }
.group > .weekend { background-color: #f1f0ec; }
tbody tr:hover > * { background-color: #f9f9f8; }
tfoot th, tfoot td { position: sticky; bottom: 0; z-index: 2; border-top: 1px solid #d9d8d4; border-bottom: none; background-color: #f7f6f3; font-weight: 600; color: #111; }
tfoot .weekend { background-color: #f1f0ec; }
@media print {
  body { padding: 0; background: #fff; }
  .wrap { overflow: visible; max-height: none; border: none; }
  thead th, tfoot th, tfoot td, .label { position: static; }
}
`;

function renderLabelCell(row: ExportRow): string {
  const label = row.href
    ? `<a class="key" href="${escapeHtml(row.href)}" target="_blank" rel="noreferrer">${escapeHtml(row.label)}</a>`
    : `<span${classes(row.kind === 'issue' && 'key')}>${escapeHtml(row.label)}</span>`;
  const secondary = row.secondary ? `<span class="secondary">${escapeHtml(row.secondary)}</span>` : '';
  return `<th scope="row" class="label" title="${escapeHtml(row.secondary || row.label)}">${label}${secondary}</th>`;
}

export function buildReportHtml(model: ExportModel): string {
  const format = (seconds: number) => escapeHtml(formatDuration(seconds, model.timeFormat));
  const periodClasses = (index: number) => classes('num', 'period', model.periods[index].isWeekend && 'weekend');

  const head = `
<tr>
  <th rowspan="2" scope="col" class="label">${escapeHtml(model.rowHeaderLabel)}</th>
  ${model.fieldNames.map((name) => `<th rowspan="2" scope="col" class="field">${escapeHtml(name)}</th>`).join('')}
  <th rowspan="2" scope="col" class="num total">Total</th>
  ${model.bands.map((band) => `<th colspan="${band.span}" scope="colgroup" class="band">${escapeHtml(band.label)}</th>`).join('')}
</tr>
<tr>
  ${model.periods
    .map(
      (period, index) =>
        `<th scope="col"${periodClasses(index)} title="${escapeHtml(period.title)}"><span class="period-label">${escapeHtml(period.label)}</span><span class="period-sub">${escapeHtml(period.sublabel)}</span></th>`,
    )
    .join('')}
</tr>`;

  const body = model.rows
    .map(
      (row) => `
<tr${classes(row.kind === 'group' && 'group', row.isChild && 'child')}>
  ${renderLabelCell(row)}
  ${row.fields.map((value) => `<td class="field" title="${escapeHtml(value)}">${escapeHtml(value)}</td>`).join('')}
  <td class="num total">${format(row.total)}</td>
  ${row.periods.map((seconds, index) => `<td${periodClasses(index)}>${format(seconds)}</td>`).join('')}
</tr>`,
    )
    .join('');

  const foot = `
<tr>
  <th scope="row" class="label">Total</th>
  ${model.fieldNames.map(() => '<td class="field"></td>').join('')}
  <td class="num total">${format(model.totals.total)}</td>
  ${model.totals.periods.map((seconds, index) => `<td${periodClasses(index)}>${format(seconds)}</td>`).join('')}
</tr>`;

  const title = [model.title, ...model.meta.slice(0, 2)].join(' · ');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<header>
  <h1>${escapeHtml(model.title)}</h1>
  <p class="meta">${model.meta.map(escapeHtml).join(' · ')}</p>
</header>
<div class="wrap">
<table>
<thead>${head}</thead>
<tbody>${body}</tbody>
<tfoot>${foot}</tfoot>
</table>
</div>
<footer>${escapeHtml(formatGeneratedAt(model.generatedAt))}</footer>
</body>
</html>
`;
}

export async function exportReportHtml(model: ExportModel): Promise<void> {
  downloadBlob(`${model.fileBaseName}.html`, new Blob([buildReportHtml(model)], { type: 'text/html;charset=utf-8' }));
}
