import { type CSSProperties, useId, useMemo } from 'react';
import { TooltipPanel } from '../../../components/TooltipPanel';
import { useHoverTooltip } from '../../../hooks/useHoverTooltip';
import { niceScale } from '../../../lib/niceScale';
import { useElementWidth } from '../hooks/useElementWidth';
import { withSeriesLimit } from '../lib/datasets';
import { formatAxisValue, formatValue } from '../lib/format';
import { SERIES_COLORS, SINGLE_COLOR } from '../lib/palette';
import { measureOf } from '../lib/schema';
import { seriesColor } from '../lib/seriesColor';
import type { AggregateDataset, DimValue } from '../types';
import { ChartTooltip } from './ChartTooltip';
import styles from './ColumnsChart.module.css';
import { SeriesLegend } from './SeriesLegend';

interface ColumnsChartProps {
  data: AggregateDataset;
  /** Altura da área das colunas; o eixo vem abaixo, fora dela. */
  height?: number;
}

/** Largura aproximada de um caractere do eixo (Geist Mono, 10.5px) e a folga entre rótulos. */
const AXIS_CHAR_PX = 6.6;
const AXIS_GAP_PX = 14;

/** Rótulos do eixo de baixo que cabem na largura sem encostar uns nos outros. */
function maxAxisLabels(categories: DimValue[], width: number): number {
  const longest = Math.max(1, ...categories.map((category) => category.label.length));
  return Math.max(2, Math.floor(width / (longest * AXIS_CHAR_PX + AXIS_GAP_PX)));
}


/**
 * Colunas na ordem dos grupos (as datas em ordem), com eixo redondo e um
 * tooltip por coluna. Com "Cruzar com", cada coluna empilha as séries.
 */
export function ColumnsChart({ data, height = 200 }: ColumnsChartProps) {
  const tooltipId = useId();
  const { target, show, hide } = useHoverTooltip<DimValue>({ openDelayMs: 80 });
  const axis = useElementWidth<HTMLDivElement>();
  const limited = useMemo(() => withSeriesLimit(data, SERIES_COLORS.length), [data]);
  const { unit, label: measureLabel } = measureOf(data.source, data.spec.measure);
  const hasSeries = limited.seriesList.length > 0;
  const { categories } = limited;

  const stackOf = (category: DimValue) =>
    hasSeries
      ? limited.seriesList.reduce((sum, series) => sum + (limited.cells[category.key]?.[series.key] ?? 0), 0)
      : (limited.values[category.key] ?? 0);
  const toAxis = (value: number) => (unit === 'duration' ? value / 3600 : value);
  const scale = niceScale(Math.max(0, ...categories.map((category) => toAxis(stackOf(category)))));
  const percent = (value: number) => `${Math.min(100, (toAxis(value) / scale.max) * 100)}%`;
  // Antes de medir (primeiro render), poucos rótulos: nunca encostam.
  const labelEvery = Math.max(1, Math.ceil(categories.length / maxAxisLabels(categories, axis.width || 240)));

  if (categories.length === 0 || limited.total === 0) return <p className={styles.empty}>Nenhum dado no período.</p>;

  return (
    <div className={styles.wrap}>
      {hasSeries && <SeriesLegend series={limited.seriesList} colorOf={seriesColor} />}
      <div className={styles.chart} style={{ '--plot-height': `${height}px` } as CSSProperties}>
        <div className={styles.yAxis} aria-hidden>
          {scale.ticks.map((tick) => (
            <span key={tick} className={styles.tick} style={{ bottom: `${(tick / scale.max) * 100}%` }}>
              {formatAxisValue(tick, unit)}
            </span>
          ))}
        </div>

        <div className={styles.plot}>
          {scale.ticks.slice(1).map((tick) => (
            <span key={tick} className={styles.gridline} style={{ bottom: `${(tick / scale.max) * 100}%` }} aria-hidden />
          ))}
          <ol className={styles.columns} aria-label={measureLabel}>
            {categories.map((category) => {
              const stack = stackOf(category);
              return (
                <li key={category.key} className={styles.slot}>
                  <span
                    className={styles.hit}
                    tabIndex={0}
                    role="img"
                    aria-label={`${category.label}: ${formatValue(limited.values[category.key] ?? 0, unit)}`}
                    aria-describedby={target?.data.key === category.key ? tooltipId : undefined}
                    data-active={target?.data.key === category.key || undefined}
                    onPointerEnter={(event) => show(event.currentTarget, category)}
                    onPointerLeave={hide}
                    onFocus={(event) => show(event.currentTarget, category)}
                    onBlur={hide}
                  >
                    {stack > 0 && (
                      <span className={styles.stack} style={{ height: percent(stack) }}>
                        {hasSeries ? (
                          limited.seriesList.map((series, index) => {
                            const value = limited.cells[category.key]?.[series.key] ?? 0;
                            return value > 0 ? (
                              <span
                                key={series.key}
                                className={styles.segment}
                                style={{ flexGrow: value, background: seriesColor(series, index) }}
                              />
                            ) : null;
                          })
                        ) : (
                          <span className={styles.segment} style={{ flexGrow: 1, background: SINGLE_COLOR }} />
                        )}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div ref={axis.ref} className={styles.xAxis} aria-hidden>
          {categories.map((category, index) => (
            <span key={category.key} className={styles.axisLabel}>
              {index % labelEvery === 0 ? category.label : ''}
            </span>
          ))}
        </div>
      </div>

      {target && (
        <TooltipPanel anchor={target.anchor} id={tooltipId}>
          <ChartTooltip
            title={target.data.label}
            rows={[
              ...limited.seriesList
                .map((series, index) => ({
                  label: series.label,
                  raw: limited.cells[target.data.key]?.[series.key] ?? 0,
                  color: seriesColor(series, index),
                }))
                .filter((row) => row.raw > 0)
                .map((row) => ({ label: row.label, value: formatValue(row.raw, unit), color: row.color })),
              {
                label: hasSeries ? 'Total' : measureLabel,
                value: formatValue(limited.values[target.data.key] ?? 0, unit),
                isTotal: hasSeries,
              },
            ]}
          />
        </TooltipPanel>
      )}
    </div>
  );
}
