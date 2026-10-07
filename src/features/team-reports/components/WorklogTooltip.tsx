import { TooltipPanel } from '../../../components/TooltipPanel';
import { formatDuration, type TimeFormat } from '../../../lib/formatDuration';
import type { CellWorklog } from '../lib/buildReportTable';
import styles from './WorklogTooltip.module.css';

/** Colunas de semana/mês podem somar dezenas de apontamentos; o tooltip lista os primeiros. */
const MAX_WORKLOGS = 6;

interface WorklogTooltipProps {
  /** Célula a que o tooltip se refere. */
  anchor: HTMLElement;
  /** Período da célula (ex: "28/09/2026 (seg)"). */
  title: string;
  seconds: number;
  worklogs: CellWorklog[];
  timeFormat: TimeFormat;
  /** Mostra quem apontou (relatório com mais de uma pessoa). */
  showAuthor: boolean;
}

export function WorklogTooltip({ anchor, title, seconds, worklogs, timeFormat, showAuthor }: WorklogTooltipProps) {
  const shown = worklogs.slice(0, MAX_WORKLOGS);
  const hiddenCount = worklogs.length - shown.length;
  // Com um apontamento só e uma pessoa só, o cabeçalho já diz tudo.
  const showMeta = showAuthor || worklogs.length > 1;

  return (
    <TooltipPanel anchor={anchor}>
      <div className={styles.header}>
        <span>{title}</span>
        <span className={styles.total}>{formatDuration(seconds, timeFormat)}</span>
      </div>

      <ul className={styles.list}>
        {shown.map((worklog) => (
          <li key={worklog.id}>
            {showMeta && (
              <span className={styles.meta}>
                {showAuthor && <span className={styles.author}>{worklog.author}</span>}
                {formatDuration(worklog.seconds, timeFormat)}
              </span>
            )}
            {worklog.comment ? (
              <p className={styles.comment}>{worklog.comment}</p>
            ) : (
              <p className={styles.empty}>Sem descrição</p>
            )}
          </li>
        ))}
      </ul>

      {hiddenCount > 0 && (
        <p className={styles.more}>
          +{hiddenCount} {hiddenCount === 1 ? 'apontamento' : 'apontamentos'}
        </p>
      )}
    </TooltipPanel>
  );
}
