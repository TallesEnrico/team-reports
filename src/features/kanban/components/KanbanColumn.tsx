import { useDroppable } from '@dnd-kit/core';
import { memo, type ReactNode } from 'react';
import { parentToIssue } from '../../../lib/parentIssue';
import type { ColumnView } from '../lib/boardView';
import { columnDropId, statusDropId } from '../lib/dropTargets';
import type { IssueStatus, IssueTransition, JiraIssue } from '../types';
import { ColumnEstimate } from './ColumnEstimate';
import { KanbanCard } from './KanbanCard';
import styles from './KanbanColumn.module.css';

/**
 * Estado da coluna durante um arrasto: `loading` (buscando as transições do
 * card), `target` (aceita o card), `blocked` (sem transição para cá), `origin`
 * (coluna do card, sem outro status possível) ou `outside` (raia de outra
 * história: a subtarefa só muda de coluna na própria raia).
 */
export type ColumnDragState = 'idle' | 'loading' | 'target' | 'blocked' | 'origin' | 'outside';

interface KanbanColumnProps {
  view: ColumnView;
  dragState: ColumnDragState;
  /** Transições para os status desta coluna (com `dragState` = 'target'). */
  targets?: IssueTransition[];
  /** Status atual do card arrastado, quando esta é a coluna dele. */
  currentStatus?: IssueStatus;
  isFiltered: boolean;
  canDrag: boolean;
  onOpenIssue: (issue: JiraIssue) => void;
  /**
   * `lane`: coluna dentro de uma raia (agrupamento por história): cabeçalho
   * compacto, sem o limite de WIP (que vale para a coluna inteira do quadro).
   */
  variant?: 'board' | 'lane';
  /** Chave da raia: deixa os alvos de soltar únicos entre raias. */
  scope?: string;
  /** Nome da raia, para leitores de tela. */
  laneLabel?: string;
  /** Depois do último card (ex: o "Carregar mais" das concluídas). */
  footer?: ReactNode;
}

interface StatusDropZoneProps {
  columnId: string;
  status: IssueStatus;
  isCurrent: boolean;
  scope?: string;
}

function StatusDropZone({ columnId, status, isCurrent, scope }: StatusDropZoneProps) {
  const label = isCurrent ? `${status.name} · atual` : status.name;
  const { setNodeRef, isOver } = useDroppable({ id: statusDropId(columnId, status.id, scope), data: { label } });
  return (
    <div ref={setNodeRef} className={styles.zone} data-current={isCurrent || undefined} data-over={isOver || undefined}>
      <span className={styles.zoneLabel}>{label}</span>
    </div>
  );
}

export const KanbanColumn = memo(function KanbanColumn({
  view,
  dragState,
  targets,
  currentStatus,
  isFiltered,
  canDrag,
  onOpenIssue,
  variant = 'board',
  scope,
  laneLabel,
  footer,
}: KanbanColumnProps) {
  const isLane = variant === 'lane';
  const { column, total, shown, metrics, groups } = view;
  // Na coluna do próprio card sempre há faixas, com a do status atual: soltar o
  // card de volta onde estava não pode mudar o status sem querer.
  const splitByStatus = dragState === 'target' && ((targets?.length ?? 0) > 1 || currentStatus !== undefined);
  const zoneStatuses = [...(currentStatus ? [currentStatus] : []), ...(targets ?? []).map((transition) => transition.to)];
  // Com um status possível a coluna inteira recebe o card; com vários, as faixas de status.
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(column.id, scope),
    disabled: dragState !== 'target' || splitByStatus,
    data: { label: column.name },
  });
  const exceeded = column.max !== undefined && total > column.max;

  return (
    <section
      className={styles.column}
      data-variant={variant}
      data-drag={dragState}
      data-over={(isOver && !splitByStatus) || undefined}
      aria-label={`${column.name}${laneLabel ? ` (${laneLabel})` : ''}: ${shown} ${shown === 1 ? 'card' : 'cards'}`}
    >
      <header className={styles.header} data-exceeded={(!isLane && exceeded) || undefined}>
        {isLane ? <h3 className={styles.name}>{column.name}</h3> : <h2 className={styles.name}>{column.name}</h2>}
        {(!isLane || shown > 0) && (
          <span className={styles.count} title={isFiltered && !isLane ? 'Cards com os filtros / total da coluna' : undefined}>
            {isFiltered && !isLane ? `${shown}/${total}` : shown}
          </span>
        )}
        {(!isLane || shown > 0) && (
          <ColumnEstimate
            columnName={laneLabel ? `${column.name} · ${laneLabel}` : column.name}
            metrics={metrics}
            shown={shown}
            total={total}
            isFiltered={isFiltered && !isLane}
          />
        )}
        {!isLane && column.max !== undefined && (
          <span className={styles.limit} title="Limite de cards da coluna (WIP)">
            Máx. {column.max}
          </span>
        )}
      </header>

      <div ref={setNodeRef} className={styles.body}>
        {groups.map((group) => {
          const cards = group.issues.map((issue) => (
            <li key={issue.id}>
              <KanbanCard issue={issue} canDrag={canDrag} onOpen={onOpenIssue} />
            </li>
          ));
          if (!group.header) {
            return (
              <ul key={group.key} className={styles.cards}>
                {cards}
              </ul>
            );
          }
          const { header } = group;
          return (
            <div key={group.key} className={styles.group}>
              <p className={styles.groupHeader} title={header.subtitle ? `${header.title} ${header.subtitle}` : header.title}>
                {header.iconUrl && <img src={header.iconUrl} alt="" width={14} height={14} />}
                {header.parent ? (
                  // A issue pai abre no modal (com o link do Jira lá dentro).
                  <button
                    type="button"
                    className={styles.groupOpen}
                    aria-haspopup="dialog"
                    onClick={() => onOpenIssue(parentToIssue(header.parent!))}
                  >
                    <span className={styles.groupKey}>{header.title}</span>
                    {header.subtitle && <span className={styles.groupSubtitle}>{header.subtitle}</span>}
                  </button>
                ) : (
                  <>
                    <span className={styles.groupKey}>{header.title}</span>
                    {header.subtitle && <span className={styles.groupSubtitle}>{header.subtitle}</span>}
                  </>
                )}
              </p>
              <ul className={styles.cards}>{cards}</ul>
            </div>
          );
        })}

        {shown === 0 && !isLane && (
          <p className={styles.empty}>{isFiltered && total > 0 ? 'Nenhum card com estes filtros' : 'Nenhum card'}</p>
        )}

        {footer}

        {splitByStatus && (
          <div className={styles.zones}>
            {zoneStatuses.map((status) => (
              <StatusDropZone
                key={status.id}
                columnId={column.id}
                status={status}
                isCurrent={status.id === currentStatus?.id}
                scope={scope}
              />
            ))}
          </div>
        )}
        {dragState === 'blocked' && <p className={styles.blockedHint}>Sem transição para esta coluna</p>}
      </div>
    </section>
  );
});
