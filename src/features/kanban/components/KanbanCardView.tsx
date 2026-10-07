import { Clock } from '@phosphor-icons/react';
import { overEstimateSeconds } from '../../../api/jira-issues';
import { Avatar } from '../../../components/Avatar';
import { StatusLozenge } from '../../../components/StatusLozenge';
import { cx } from '../../../lib/cx';
import { formatDuration } from '../../../lib/formatDuration';
import type { JiraIssue } from '../types';
import styles from './KanbanCard.module.css';

interface KanbanCardViewProps {
  issue: JiraIssue;
  /** Cópia que acompanha o mouse durante o arrasto. */
  isOverlay?: boolean;
}

/** Conteúdo do card: resumo, status, tempo, tipo + chave, prioridade e responsável. */
export function KanbanCardView({ issue, isOverlay = false }: KanbanCardViewProps) {
  const spent = formatDuration(issue.timeSpentSeconds, 'hours-minutes');
  const estimate = issue.originalEstimateSeconds ? formatDuration(issue.originalEstimateSeconds, 'hours-minutes') : '';
  const isDone = issue.status.categoryKey === 'done';
  const over = overEstimateSeconds(issue);
  const overText = formatDuration(over, 'hours-minutes');

  return (
    // Acima da estimativa: faixa vermelha na borda e o excedente ao lado do tempo.
    <article className={cx(styles.card, isOverlay && styles.overlay)} data-over-estimate={over > 0 || undefined}>
      <p className={styles.summary}>{issue.summary}</p>
      <div className={styles.status}>
        <StatusLozenge status={issue.status} />
      </div>
      {(spent || estimate) && (
        <p
          className={cx(styles.time, over > 0 && styles.overTime)}
          title={over > 0 ? `Acima da estimativa em ${overText}` : 'Tempo lançado / estimativa original'}
        >
          <Clock size={13} weight="bold" aria-hidden />
          <span>
            {spent || '0h 00m'}
            {estimate && <span className={styles.estimate}> de {estimate}</span>}
          </span>
          {over > 0 && (
            <span className={styles.overBadge}>
              +{overText}
              <span className="sr-only"> acima da estimativa</span>
            </span>
          )}
        </p>
      )}
      <footer className={styles.footer}>
        <span className={styles.keyGroup}>
          {issue.issueType.iconUrl && (
            <img src={issue.issueType.iconUrl} alt={issue.issueType.name} title={issue.issueType.name} width={16} height={16} />
          )}
          <span className={cx(styles.key, isDone && styles.done)}>{issue.key}</span>
        </span>
        <span className={styles.meta}>
          {issue.priority?.iconUrl && (
            <img src={issue.priority.iconUrl} alt={`Prioridade ${issue.priority.name}`} title={issue.priority.name} width={16} height={16} />
          )}
          {issue.assignee ? (
            <Avatar src={issue.assignee.avatarUrl} name={issue.assignee.displayName} size={24} showTitle />
          ) : (
            <span className={styles.unassigned} title="Sem responsável" aria-label="Sem responsável" />
          )}
        </span>
      </footer>
    </article>
  );
}
