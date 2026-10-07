import { Hourglass } from '@phosphor-icons/react';
import { type MouseEvent, useId } from 'react';
import { TooltipPanel } from '../../../components/TooltipPanel';
import { useHoverTooltip } from '../../../hooks/useHoverTooltip';
import { formatDuration } from '../../../lib/formatDuration';
import type { ColumnMetrics } from '../lib/boardView';
import styles from './ColumnEstimate.module.css';

interface ColumnEstimateProps {
  columnName: string;
  metrics: ColumnMetrics;
  shown: number;
  total: number;
  isFiltered: boolean;
}

function hours(seconds: number): string {
  return formatDuration(seconds, 'hours-minutes') || '0h 00m';
}

function cards(count: number): string {
  return `${count} ${count === 1 ? 'card' : 'cards'}`;
}

/**
 * Horas estimadas somadas da coluna, no cabeçalho dela. Hover, foco ou toque
 * abrem as demais métricas (lançado, restante, progresso, cards sem estimativa…).
 */
export function ColumnEstimate({ columnName, metrics, shown, total, isFiltered }: ColumnEstimateProps) {
  const tooltipId = useId();
  const { target, show, hide } = useHoverTooltip<null>({ openDelayMs: 150 });
  const { estimatedSeconds, spentSeconds, remainingSeconds, withoutEstimate, overEstimate } = metrics;
  const progress = estimatedSeconds > 0 ? spentSeconds / estimatedSeconds : undefined;

  // No toque não há hover: o toque abre e fecha.
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if ((event.nativeEvent as PointerEvent).pointerType !== 'touch') return;
    if (target) hide();
    else show(event.currentTarget, null);
  }

  return (
    <>
      <button
        type="button"
        className={styles.badge}
        aria-label={`Horas estimadas da coluna: ${hours(estimatedSeconds)}`}
        aria-describedby={target ? tooltipId : undefined}
        onPointerEnter={(event) => event.pointerType !== 'touch' && show(event.currentTarget, null)}
        onPointerLeave={hide}
        onFocus={(event) => show(event.currentTarget, null)}
        onBlur={hide}
        onClick={handleClick}
      >
        <Hourglass size={13} weight="bold" aria-hidden />
        <span>{hours(estimatedSeconds)}</span>
      </button>

      {target && (
        <TooltipPanel anchor={target.anchor} id={tooltipId} placement="bottom" className={styles.tooltip}>
          <p className={styles.title}>
            <span className={styles.name}>{columnName}</span>
            <span>{isFiltered ? `${cards(shown)} de ${total}` : cards(shown)}</span>
          </p>

          <dl className={styles.stats}>
            <div>
              <dt>Estimado</dt>
              <dd>{hours(estimatedSeconds)}</dd>
            </div>
            <div>
              <dt>Lançado</dt>
              <dd>{hours(spentSeconds)}</dd>
            </div>
            <div>
              <dt>Restante</dt>
              <dd>{hours(remainingSeconds)}</dd>
            </div>
          </dl>

          {progress !== undefined && (
            <div className={styles.progressRow}>
              <span className={styles.bar} data-over={progress > 1 || undefined} aria-hidden>
                <span style={{ width: `${Math.min(progress, 1) * 100}%` }} />
              </span>
              <span className={styles.percent}>{Math.round(progress * 100)}% do estimado lançado</span>
            </div>
          )}

          {(withoutEstimate > 0 || overEstimate > 0) && (
            <ul className={styles.notes}>
              {withoutEstimate > 0 && <li>{cards(withoutEstimate)} sem estimativa</li>}
              {overEstimate > 0 && <li className={styles.warning}>{cards(overEstimate)} acima da estimativa</li>}
            </ul>
          )}

          {isFiltered && <p className={styles.hint}>Só os cards que passam nos filtros.</p>}
        </TooltipPanel>
      )}
    </>
  );
}
