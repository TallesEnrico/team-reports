import { withSeriesLimit } from '../lib/datasets';
import { formatValue, plural } from '../lib/format';
import { heatPainter } from '../lib/heat';
import { SERIES_COLORS, SINGLE_COLOR } from '../lib/palette';
import { measureOf, schemaOf } from '../lib/schema';
import { seriesColor } from '../lib/seriesColor';
import type { AggregateDataset, Dataset, VisualConfig, VisualKind } from '../types';
import { numberOf } from './NumberView';
import styles from './PiecePreview.module.css';

/** Linha de contagem de uma peça: "1.234 apontamentos", "8 grupos". */
export function countLabel(data: Dataset): string {
  if (data.kind === 'aggregate') {
    if (!data.spec.by) return `Total: ${formatValue(data.total, measureOf(data.source, data.spec.measure).unit)}`;
    return plural(data.categories.length, 'grupo', 'grupos') + (data.seriesList.length ? ` × ${data.seriesList.length}` : '');
  }
  const [singular, pluralForm] = schemaOf(data.source).noun;
  return plural(data.records.length, singular, pluralForm);
}

function stackOf(data: AggregateDataset, key: string): number {
  if (data.seriesList.length === 0) return data.values[key] ?? 0;
  return data.seriesList.reduce((sum, series) => sum + (data.cells[key]?.[series.key] ?? 0), 0);
}

/** Miniatura do bloco dentro da peça, para ver o resultado sem sair da montagem. */
export function PiecePreview({ kind, config, data }: { kind: VisualKind; config: VisualConfig; data: Dataset }) {
  if (kind === 'number') {
    return <p className={styles.number}>{numberOf(data, config).formatted}</p>;
  }
  if (kind === 'table' || data.kind !== 'aggregate') {
    return <p className={styles.caption}>{countLabel(data)} na tabela</p>;
  }

  if (kind === 'heatmap') {
    // Como no bloco: todas as colunas, sem juntar as menores em "Outras".
    const rows = data.categories.slice(0, 6);
    const columns = data.seriesList.slice(0, 16);
    const max = Math.max(0, ...rows.flatMap((row) => columns.map((column) => data.cells[row.key]?.[column.key] ?? 0)));
    const painter = heatPainter(config.heat, measureOf(data.source, data.spec.measure).unit, max);
    return (
      <div className={styles.heat} style={{ gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, 1fr)` }} aria-hidden>
        {rows.flatMap((row) =>
          columns.map((column) => (
            <span key={`${row.key}|${column.key}`} style={{ background: painter.color(data.cells[row.key]?.[column.key] ?? 0) }} />
          )),
        )}
      </div>
    );
  }

  const limited = withSeriesLimit(data, SERIES_COLORS.length);
  const categories = kind === 'bars' ? limited.categories.slice(0, 4) : limited.categories.slice(-31);
  const max = Math.max(0, ...categories.map((category) => stackOf(limited, category.key))) || 1;
  const segmentsOf = (key: string) =>
    limited.seriesList.length === 0
      ? [{ key: 'value', value: limited.values[key] ?? 0, color: SINGLE_COLOR }]
      : limited.seriesList.map((series, index) => ({
          key: series.key,
          value: limited.cells[key]?.[series.key] ?? 0,
          color: seriesColor(series, index),
        }));

  if (kind === 'bars') {
    return (
      <ol className={styles.bars} aria-hidden>
        {categories.map((category) => (
          <li key={category.key}>
            <span className={styles.barLabel}>{category.label}</span>
            <span className={styles.barTrack}>
              {segmentsOf(category.key).map((segment) =>
                segment.value > 0 ? (
                  <span key={segment.key} style={{ width: `${(segment.value / max) * 100}%`, background: segment.color }} />
                ) : null,
              )}
            </span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className={styles.columns} aria-hidden>
      {categories.map((category) => (
        <span key={category.key} className={styles.column} style={{ height: `${(stackOf(limited, category.key) / max) * 100}%` }}>
          {segmentsOf(category.key).map((segment) =>
            segment.value > 0 ? <span key={segment.key} style={{ flexGrow: segment.value, background: segment.color }} /> : null,
          )}
        </span>
      ))}
    </div>
  );
}
