import { useDraggable } from '@dnd-kit/core';
import { type KeyboardEvent, memo } from 'react';
import { cx } from '../../../lib/cx';
import type { JiraIssue } from '../types';
import styles from './KanbanCard.module.css';
import { KanbanCardView } from './KanbanCardView';

interface KanbanCardProps {
  issue: JiraIssue;
  /** Sem escopo de escrita o card só abre os detalhes. */
  canDrag: boolean;
  onOpen: (issue: JiraIssue) => void;
}

/** Card arrastável: clique ou Enter abre os detalhes; espaço pega o card pelo teclado. */
export const KanbanCard = memo(function KanbanCard({ issue, canDrag, onOpen }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: issue.id,
    disabled: !canDrag,
    data: { issue },
  });

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onOpen(issue);
      return;
    }
    listeners?.onKeyDown?.(event);
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // Desligado só impede arrastar: o card continua sendo um botão que abre os detalhes.
      aria-disabled={undefined}
      aria-label={`${issue.key}: ${issue.summary}`}
      className={cx(styles.handle, canDrag && styles.draggable, isDragging && styles.placeholder)}
      onClick={() => onOpen(issue)}
      onKeyDown={handleKeyDown}
    >
      <KanbanCardView issue={issue} />
    </div>
  );
});
