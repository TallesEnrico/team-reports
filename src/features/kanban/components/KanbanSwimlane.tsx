import { CaretDown } from '@phosphor-icons/react';
import { memo, type ReactNode } from 'react';
import { StatusLozenge } from '../../../components/StatusLozenge';
import { cx } from '../../../lib/cx';
import { parentToIssue } from '../../../lib/parentIssue';
import type { ColumnView } from '../lib/boardView';
import type { Swimlane } from '../lib/swimlanes';
import type { JiraIssue } from '../types';
import styles from './KanbanSwimlane.module.css';

interface KanbanSwimlaneProps {
  lane: Swimlane;
  isCollapsed: boolean;
  onToggle: (laneKey: string) => void;
  /** O quadro desenha cada coluna (com o estado do arrasto). */
  renderColumn: (view: ColumnView, lane: Swimlane) => ReactNode;
  /** Clique na história: abre o modal dela. */
  onOpenIssue: (issue: JiraIssue) => void;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Raia de uma história: cabeçalho com a história e, abaixo, as colunas do quadro com as subtarefas dela. */
export const KanbanSwimlane = memo(function KanbanSwimlane({
  lane,
  isCollapsed,
  onToggle,
  renderColumn,
  onOpenIssue,
}: KanbanSwimlaneProps) {
  const { story, cardCount } = lane;
  const title = story ? `${story.key} ${story.summary}` : 'Outras issues';
  const isDone = story?.status?.categoryKey === 'done';

  return (
    <section className={styles.lane} aria-label={title}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? 'Expandir' : 'Recolher'} ${title}`}
          onClick={() => onToggle(lane.key)}
        >
          <CaretDown size={14} weight="bold" aria-hidden />
        </button>

        {story ? (
          <>
            {story.iconUrl && <img src={story.iconUrl} alt="" width={18} height={18} />}
            {/* A história abre no modal (com o link do Jira lá dentro). */}
            <button
              type="button"
              className={styles.open}
              aria-haspopup="dialog"
              title={story.summary}
              onClick={() => onOpenIssue(parentToIssue(story))}
            >
              <span className={cx(styles.key, isDone && styles.done)}>{story.key}</span>
              <span className={styles.summary}>{story.summary}</span>
            </button>
            <span className={styles.count}>({plural(cardCount, 'subtarefa', 'subtarefas')})</span>
            {story.epic && (
              <span className={styles.epic} title={`Épico ${story.epic.key}`}>
                <span className={styles.epicMark} aria-hidden />
                {story.epic.summary}
              </span>
            )}
            {story.status && <StatusLozenge status={story.status} />}
          </>
        ) : (
          <>
            <span className={styles.others}>Outras issues</span>
            <span className={styles.count}>({plural(cardCount, 'card', 'cards')})</span>
          </>
        )}
      </div>

      {!isCollapsed && <div className={styles.row}>{lane.columns.map((view) => renderColumn(view, lane))}</div>}
    </section>
  );
});
