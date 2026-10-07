import { overEstimateSeconds, type TimeTotals } from '../api/jira-issues';
import { cx } from '../lib/cx';
import { formatDuration } from '../lib/formatDuration';
import styles from './TimeTracking.module.css';

interface TimeTrackingProps {
  totals: TimeTotals;
  /** Enquanto os números carregam (ex: a soma das filhas de um épico): aparecem como "…". */
  isPending?: boolean;
  /** `compact`: menor, para caber num card (ex: a tarefa escolhida no "Lançar horas"). */
  size?: 'regular' | 'compact';
  /**
   * Duração do lançamento em edição ("Lançar horas"), em segundos; `null` com
   * início ou fim por preencher. Com ele, aparece "Com este": o lançado somado a
   * ele (como fica depois de lançar). Sem a prop (ex: modal da issue), não aparece.
   */
  draftSeconds?: number | null;
  className?: string;
}

function hours(seconds: number): string {
  return formatDuration(seconds, 'hours-minutes') || '0h 00m';
}

/**
 * Controle de tempo de uma issue: lançado, estimativa original e restante, o
 * aviso de quanto passou da estimativa e a barra do lançado sobre o total
 * previsto (lançado + restante). O mesmo no modal da issue e no "Lançar horas";
 * neste, também "Com este", com o lançamento em edição.
 */
export function TimeTracking({ totals, isPending = false, size = 'regular', draftSeconds, className }: TimeTrackingProps) {
  const spent = totals.spentSeconds;
  const estimate = totals.originalEstimateSeconds;
  const remaining = totals.remainingEstimateSeconds;
  const showsDraft = draftSeconds !== undefined;
  const draft = draftSeconds ?? 0;
  const withDraft = spent + draft;
  const over = overEstimateSeconds({ timeSpentSeconds: spent, originalEstimateSeconds: estimate });
  const overWithDraft = overEstimateSeconds({ timeSpentSeconds: withDraft, originalEstimateSeconds: estimate });
  // Lançar desconta do restante (o Jira ajusta sozinho): o total previsto só cresce se o lançamento passar dele.
  const total = remaining !== undefined ? spent + Math.max(remaining, draft) : undefined;
  const progress = total ? spent / total : undefined;
  const draftProgress = total && draft > 0 ? draft / total : 0;
  const value = (text: string) => (isPending ? '…' : text);

  return (
    <div className={cx(styles.tracking, styles[size], className)}>
      <dl className={styles.stats}>
        <div>
          <dt>Lançado:</dt>
          <dd>{value(hours(spent))}</dd>
        </div>
        <div>
          <dt>Estimado:</dt>
          <dd>{value(estimate ? hours(estimate) : '—')}</dd>
        </div>
        <div>
          <dt>Restante:</dt>
          <dd>{value(remaining !== undefined ? hours(remaining) : '—')}</dd>
        </div>
        {showsDraft && remaining && (
          <div title="O lançado da tarefa somado a este lançamento">
            <dt>Com este:</dt>
            <dd data-over={(draft > 0 && overWithDraft > 0) || undefined}>{value(draft > 0 && !overWithDraft ? hours(remaining - draft) : overWithDraft > 0 ? `-${hours(overWithDraft)}` : '—')}</dd>
          </div>
        )}
        {/* <p className="text-yellow-700">{remaining}</p>
        <p className="text-yellow-700">{draft}</p> */}
      </dl>
      {!isPending &&
        (draft > 0 && overWithDraft > 0 ? (
          <p className={styles.overEstimate}>Com este, fica {hours(overWithDraft)} acima da estimativa.</p>
        ) : (
          over > 0 && <p className={styles.overEstimate}>Acima da estimativa em {hours(over)}.</p>
        ))}
      {!isPending && progress !== undefined && (
        <div
          className={styles.progress}
          role="progressbar"
          aria-label="Tempo lançado em relação ao total previsto"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span style={{ width: `${Math.min(progress, 1) * 100}%` }} />
          {/* O lançamento em edição, listrado, logo depois do que já foi lançado. */}
          {draftProgress > 0 && <span className={styles.draft} style={{ width: `${Math.min(draftProgress, 1) * 100}%` }} />}
        </div>
      )}
    </div>
  );
}
