import { type CSSProperties, type ReactNode, useId } from 'react';
import { TooltipPanel } from '../../../components/TooltipPanel';
import { useHoverTooltip } from '../../../hooks/useHoverTooltip';
import { niceScale } from '../../../lib/niceScale';
import styles from './ColumnChart.module.css';

export interface ColumnDatum {
  id: string;
  /** Texto no eixo, embaixo da coluna; vazio não mostra nada. */
  axisLabel: string;
  /** Em segundos. */
  value: number;
  /** Esperado, em segundos: uma marca horizontal na altura dele. */
  reference?: number;
  /** `accent`: a coluna em destaque (padrão); `muted`: contexto (ex: meses anteriores). */
  tone?: 'accent' | 'muted';
  /** Fundo marcado: fim de semana ou feriado. */
  isOff?: boolean;
  /** Ainda sem o dado (mês carregando). */
  isPending?: boolean;
  /** Valor escrito sobre a coluna (rótulo seletivo). */
  capLabel?: string;
  ariaLabel: string;
  tooltip: ReactNode;
}

interface ColumnChartProps {
  data: ColumnDatum[];
  /** Nome do gráfico para leitores de tela. */
  label: string;
  /** Altura da área das colunas; o eixo vem abaixo, fora dela. */
  height?: number;
  /** `line`: a marca do esperado ocupa a coluna inteira e as vizinhas formam uma linha; `tick`: só sobre a barra. */
  referenceStyle?: 'line' | 'tick';
}

const HOUR = 3600;

function percent(value: number, max: number): string {
  return `${Math.min(100, (value / HOUR / max) * 100)}%`;
}

/**
 * Colunas de horas com eixo de horas redondo, marca do esperado e um tooltip
 * por coluna (hover e foco). Em HTML: escala com o cartão sem medir nada.
 */
export function ColumnChart({ data, label, height = 180, referenceStyle = 'line' }: ColumnChartProps) {
  const tooltipId = useId();
  const { target, show, hide } = useHoverTooltip<ColumnDatum>({ openDelayMs: 80 });
  const maxHours = Math.max(0, ...data.map((datum) => Math.max(datum.value, datum.reference ?? 0) / HOUR));
  const scale = niceScale(maxHours);

  return (
    <div className={styles.chart} style={{ '--plot-height': `${height}px` } as CSSProperties}>
      <div className={styles.yAxis} aria-hidden>
        {scale.ticks.map((tick) => (
          <span key={tick} className={styles.tick} style={{ bottom: `${(tick / scale.max) * 100}%` }}>
            {tick}h
          </span>
        ))}
      </div>

      <div className={styles.plot}>
        {scale.ticks.slice(1).map((tick) => (
          <span key={tick} className={styles.gridline} style={{ bottom: `${(tick / scale.max) * 100}%` }} aria-hidden />
        ))}
        <ol className={styles.columns} aria-label={label}>
          {data.map((datum) => (
            <li key={datum.id} className={styles.slot} data-off={datum.isOff || undefined}>
              <span
                className={styles.hit}
                tabIndex={0}
                role="img"
                aria-label={datum.ariaLabel}
                aria-describedby={target?.data.id === datum.id ? tooltipId : undefined}
                data-active={target?.data.id === datum.id || undefined}
                onPointerEnter={(event) => show(event.currentTarget, datum)}
                onPointerLeave={hide}
                onFocus={(event) => show(event.currentTarget, datum)}
                onBlur={hide}
              >
                {datum.isPending ? (
                  <span className={styles.pending} />
                ) : (
                  datum.value > 0 && (
                    <span
                      className={styles.bar}
                      data-tone={datum.tone ?? 'accent'}
                      style={{ height: percent(datum.value, scale.max) }}
                    />
                  )
                )}
                {datum.reference !== undefined && datum.reference > 0 && !datum.isPending && (
                  <span
                    className={styles.reference}
                    data-style={referenceStyle}
                    style={{ bottom: percent(datum.reference, scale.max) }}
                  />
                )}
                {datum.capLabel && (
                  <span
                    className={styles.cap}
                    style={{
                      bottom: `calc(${percent(Math.max(datum.value, datum.reference ?? 0), scale.max)} + 4px)`,
                    }}
                  >
                    {datum.capLabel}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.xAxis} aria-hidden>
        {data.map((datum) => (
          <span key={datum.id} className={styles.axisLabel}>
            {datum.axisLabel}
          </span>
        ))}
      </div>

      {target && (
        <TooltipPanel anchor={target.anchor} id={tooltipId} className={styles.tooltip}>
          {target.data.tooltip}
        </TooltipPanel>
      )}
    </div>
  );
}
