import { type CSSProperties, useId } from 'react';
import { TooltipPanel } from '../../../components/TooltipPanel';
import { useHoverTooltip } from '../../../hooks/useHoverTooltip';
import { useElementWidth } from '../hooks/useElementWidth';
import { formatValue, plural } from '../lib/format';
import { heatPainter } from '../lib/heat';
import { HEAT_RAMP } from '../lib/palette';
import { measureOf } from '../lib/schema';
import type { AggregateDataset, DimValue, HeatColors } from '../types';
import { ChartTooltip } from './ChartTooltip';
import { DimLabel } from './DimLabel';
import styles from './HeatmapChart.module.css';

interface HeatmapChartProps {
  data: AggregateDataset;
  /** Cores da peça: monocromático (padrão) ou as faixas escolhidas. */
  colors?: HeatColors;
  maxRows?: number;
  maxColumns?: number;
}

/** Com poucas colunas o valor pode ir dentro da célula; com muitas, fica no tooltip. */
const COLUMNS_WITH_VALUES = 8;
/** Largura de uma célula para o valor caber dentro ("15h 00m"), e as colunas fixas da grade (nomes e total). */
const VALUE_CELL_PX = 60;
const FIXED_COLUMNS_PX = 170 + 72;

/**
 * Grade do cruzamento: uma linha por grupo ("Agrupar por") e uma coluna por
 * valor de "Cruzar com"; quanto mais escura a célula, maior o valor.
 */
export function HeatmapChart({ data, colors, maxRows = 60, maxColumns = 62 }: HeatmapChartProps) {
  const tooltipId = useId();
  const { target, show, hide } = useHoverTooltip<{ row: DimValue; column: DimValue }>({ openDelayMs: 80 });
  const { unit, label: measureLabel } = measureOf(data.source, data.spec.measure);
  const rows = data.categories.slice(0, maxRows);
  const columns = data.seriesList.slice(0, maxColumns);
  const valueAt = (row: DimValue, column: DimValue) => data.cells[row.key]?.[column.key] ?? 0;
  const max = Math.max(0, ...rows.flatMap((row) => columns.map((column) => valueAt(row, column))));
  const painter = heatPainter(colors, unit, max);
  // O valor vai dentro da célula só quando cabe (na prévia estreita do painel, fica no tooltip).
  const grid = useElementWidth<HTMLDivElement>();
  const cellWidth = (grid.width - FIXED_COLUMNS_PX) / Math.max(1, columns.length);
  const showValues = columns.length <= COLUMNS_WITH_VALUES && cellWidth >= VALUE_CELL_PX;
  const hidden = data.categories.length - rows.length + (data.seriesList.length - columns.length);

  if (rows.length === 0 || columns.length === 0) return <p className={styles.empty}>Nenhum dado para mostrar.</p>;

  return (
    <div className={styles.wrap}>
      <div ref={grid.ref} className={styles.scroller}>
        <table className={styles.grid} style={{ '--columns': columns.length } as CSSProperties} aria-label={measureLabel}>
          <thead>
            <tr>
              <th scope="col" className={styles.corner} />
              {columns.map((column) => (
                <th key={column.key} scope="col" className={styles.columnHead} data-vertical={!showValues || undefined}>
                  <span title={column.label}>{column.label}</span>
                </th>
              ))}
              <th scope="col" className={styles.totalHead}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className={styles.rowHead}>
                  <DimLabel value={row} />
                </th>
                {columns.map((column) => {
                  const value = valueAt(row, column);
                  const isActive = target?.data.row.key === row.key && target.data.column.key === column.key;
                  return (
                    <td key={column.key} className={styles.cellSlot}>
                      <span
                        className={styles.cell}
                        tabIndex={0}
                        role="img"
                        aria-label={`${row.label}, ${column.label}: ${formatValue(value, unit)}`}
                        aria-describedby={isActive ? tooltipId : undefined}
                        data-active={isActive || undefined}
                        style={{ background: painter.color(value), color: value > 0 ? painter.ink(value) : undefined }}
                        onPointerEnter={(event) => show(event.currentTarget, { row, column })}
                        onPointerLeave={hide}
                        onFocus={(event) => show(event.currentTarget, { row, column })}
                        onBlur={hide}
                      >
                        {showValues && value > 0 ? formatValue(value, unit) : ''}
                      </span>
                    </td>
                  );
                })}
                <td className={styles.total}>{formatValue(data.values[row.key] ?? 0, unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.legend} aria-hidden>
        {painter.legend ? (
          painter.legend.map((entry) => (
            <span key={entry.label} className={styles.legendEntry}>
              <span className={styles.legendSwatch} style={{ background: entry.color }} />
              {entry.label}
            </span>
          ))
        ) : (
          <>
            <span>Menos</span>
            <span className={styles.ramp}>
              {HEAT_RAMP.map((color) => (
                <span key={color} style={{ background: color }} />
              ))}
            </span>
            <span>Mais (até {formatValue(max, unit)})</span>
          </>
        )}
        {hidden > 0 && <span className={styles.hidden}>{plural(hidden, 'linha ou coluna fora da grade', 'linhas ou colunas fora da grade')} (veja na tabela)</span>}
      </div>

      {target && (
        <TooltipPanel anchor={target.anchor} id={tooltipId}>
          <ChartTooltip
            title={target.data.row.label}
            rows={[{ label: `${target.data.column.label} · ${measureLabel}`, value: formatValue(valueAt(target.data.row, target.data.column), unit) }]}
          />
        </TooltipPanel>
      )}
    </div>
  );
}
