import { useId, useMemo } from 'react';
import { TooltipPanel } from '../../../components/TooltipPanel';
import { useHoverTooltip } from '../../../hooks/useHoverTooltip';
import { withSeriesLimit } from '../lib/datasets';
import { formatValue, plural } from '../lib/format';
import { SERIES_COLORS, SINGLE_COLOR } from '../lib/palette';
import { measureOf } from '../lib/schema';
import { seriesColor } from '../lib/seriesColor';
import type { AggregateDataset, DimValue } from '../types';
import styles from './BarsChart.module.css';
import { ChartTooltip } from './ChartTooltip';
import { DimLabel } from './DimLabel';
import { SeriesLegend } from './SeriesLegend';

interface BarsChartProps {
  data: AggregateDataset;
  /** Grupos mostrados; os demais ficam no aviso (e na tabela). */
  maxRows?: number;
}

/**
 * Barras horizontais, uma por grupo, com o rótulo em cima e o valor escrito na
 * ponta. Com "Cruzar com", cada barra empilha as séries.
 */
export function BarsChart({ data, maxRows = 40 }: BarsChartProps) {
  const tooltipId = useId();
  const { target, show, hide } = useHoverTooltip<DimValue>({ openDelayMs: 80 });
  const limited = useMemo(() => withSeriesLimit(data, SERIES_COLORS.length), [data]);
  const { unit } = measureOf(data.source, data.spec.measure);
  const rows = limited.categories.slice(0, maxRows);
  const hasSeries = limited.seriesList.length > 0;

  const lengthOf = (category: DimValue) =>
    hasSeries
      ? limited.seriesList.reduce((sum, series) => sum + (limited.cells[category.key]?.[series.key] ?? 0), 0)
      : (limited.values[category.key] ?? 0);
  const max = Math.max(0, ...rows.map(lengthOf)) || 1;

  if (rows.length === 0) return <p className={styles.empty}>Nenhum dado para mostrar.</p>;

  return (
    <div className={styles.chart}>
      {hasSeries && <SeriesLegend series={limited.seriesList} colorOf={seriesColor} />}
      <ol className={styles.list}>
        {rows.map((category) => (
          <li
            key={category.key}
            className={styles.item}
            data-active={target?.data.key === category.key || undefined}
            onPointerEnter={(event) => show(event.currentTarget, category)}
            onPointerLeave={hide}
          >
            <div className={styles.line}>
              <span className={styles.label}>
                <DimLabel value={category} />
              </span>
              <span className={styles.value}>{formatValue(limited.values[category.key] ?? 0, unit)}</span>
            </div>
            <span
              className={styles.track}
              tabIndex={0}
              role="img"
              aria-label={`${category.label}: ${formatValue(limited.values[category.key] ?? 0, unit)}`}
              aria-describedby={target?.data.key === category.key ? tooltipId : undefined}
              onFocus={(event) => show(event.currentTarget, category)}
              onBlur={hide}
            >
              {hasSeries ? (
                limited.seriesList.map((series, index) => {
                  const value = limited.cells[category.key]?.[series.key] ?? 0;
                  // Os 2px entre os segmentos saem da largura: a barra mais longa não passa do fim.
                  const gaps = 2 * (limited.seriesList.filter((other) => (limited.cells[category.key]?.[other.key] ?? 0) > 0).length - 1);
                  return value > 0 ? (
                    <span
                      key={series.key}
                      className={styles.segment}
                      style={{ width: `calc((100% - ${gaps}px) * ${value / max})`, background: seriesColor(series, index) }}
                    />
                  ) : null;
                })
              ) : (
                // Zerado (ex: pessoa escolhida sem horas): sem barra nenhuma.
                lengthOf(category) > 0 && (
                  <span className={styles.segment} style={{ width: `${(lengthOf(category) / max) * 100}%`, background: SINGLE_COLOR }} />
                )
              )}
            </span>
          </li>
        ))}
      </ol>
      {limited.categories.length > rows.length && (
        <p className={styles.more}>
          Mais {plural(limited.categories.length - rows.length, 'grupo', 'grupos')} na tabela. Encaixe um "Ordenar" para mostrar só os primeiros.
        </p>
      )}

      {target && (
        <TooltipPanel anchor={target.anchor} id={tooltipId}>
          <ChartTooltip
            title={target.data.label}
            rows={[
              ...limited.seriesList
                .map((series, index) => ({
                  label: series.label,
                  value: formatValue(limited.cells[target.data.key]?.[series.key] ?? 0, unit),
                  color: seriesColor(series, index),
                  raw: limited.cells[target.data.key]?.[series.key] ?? 0,
                }))
                .filter((row) => row.raw > 0),
              {
                label: hasSeries ? 'Total' : measureOf(data.source, data.spec.measure).label,
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
