import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { transitionsQueryOptions } from '../../../api/issueTransitionsQuery';
import { describeTransitionError, useTransitionIssueMutation } from '../../../api/useTransitionIssueMutation';
import { Notice } from '../../../components/Notice';
import { RefreshOverlay } from '../../../components/RefreshOverlay';
import { cx } from '../../../lib/cx';
import { type ColumnView, columnIdByStatus } from '../lib/boardView';
import { dropTargetsByColumn, transitionForDrop } from '../lib/dropTargets';
import type { Swimlane } from '../lib/swimlanes';
import type { BoardColumn, IssueTransition, JiraIssue } from '../types';
import styles from './KanbanBoard.module.css';
import { KanbanCardView } from './KanbanCardView';
import { type ColumnDragState, KanbanColumn } from './KanbanColumn';
import { KanbanSwimlane } from './KanbanSwimlane';

interface KanbanBoardProps {
  columns: BoardColumn[];
  views: ColumnView[];
  /** Agrupamento por história: o quadro vira raias (uma por história) em vez de colunas soltas. */
  lanes?: Swimlane[];
  isFiltered: boolean;
  canDrag: boolean;
  /** Busca em andamento com os cards já na tela (botão Atualizar ou outras pessoas). */
  isRefreshing: boolean;
  /**
   * "Carregar mais" das concluídas: depois do último card das colunas de
   * concluídas (`columnIds`) ou, nas raias, embaixo da última.
   */
  loadMore?: { columnIds: ReadonlySet<string>; content: ReactNode };
  onOpenIssue: (issue: JiraIssue) => void;
}

interface DragState {
  issue: JiraIssue;
  /** `null` enquanto as transições do card carregam. */
  targets: Map<string, IssueTransition[]> | null;
}

function labelOf(data: unknown): string {
  return (data as { label?: string } | undefined)?.label ?? 'coluna';
}

// Leitores de tela: o dnd-kit anuncia cada etapa do arrasto (padrão em inglês).
const announcements: Announcements = {
  onDragStart: ({ active }) => `Card ${(active.data.current?.issue as JiraIssue | undefined)?.key ?? ''} selecionado.`,
  onDragOver: ({ over }) => (over ? `Sobre ${labelOf(over.data.current)}.` : 'Fora das colunas.'),
  onDragEnd: ({ over }) => (over ? `Card solto em ${labelOf(over.data.current)}.` : 'Card solto fora das colunas.'),
  onDragCancel: () => 'Movimento cancelado.',
};

const screenReaderInstructions = {
  draggable:
    'Enter abre os detalhes. Para mover o card, pressione espaço, use as setas até a coluna e pressione espaço de novo. Esc cancela.',
};

export function KanbanBoard({
  columns,
  views,
  lanes,
  isFiltered,
  canDrag,
  isRefreshing,
  loadMore,
  onOpenIssue,
}: KanbanBoardProps) {
  const queryClient = useQueryClient();
  const move = useTransitionIssueMutation();
  const [drag, setDrag] = useState<DragState | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  // O fim do arrasto pode chegar antes das transições: ele espera esta promessa.
  const targetsRequest = useRef<Promise<Map<string, IssueTransition[]>> | null>(null);

  const sensors = useSensors(
    // Alguns pixels de folga: um clique simples abre o card em vez de arrastar.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  );

  const columnOfStatus = columnIdByStatus(columns);
  const [collapsedLanes, setCollapsedLanes] = useState<ReadonlySet<string>>(() => new Set());
  // Raia de cada card: nas raias, a subtarefa só pode ser solta na raia dela (como no Jira).
  const laneOfIssue = useMemo(() => {
    const map = new Map<string, string>();
    for (const lane of lanes ?? []) {
      for (const view of lane.columns) for (const group of view.groups) for (const issue of group.issues) map.set(issue.id, lane.key);
    }
    return map;
  }, [lanes]);

  const toggleLane = useCallback((laneKey: string) => {
    setCollapsedLanes((previous) => {
      const next = new Set(previous);
      if (next.has(laneKey)) next.delete(laneKey);
      else next.add(laneKey);
      return next;
    });
  }, []);

  function handleDragStart({ active }: DragStartEvent) {
    const issue = active.data.current?.issue as JiraIssue | undefined;
    if (!issue) return;
    setMoveError(null);
    setDrag({ issue, targets: null });

    const request = queryClient
      .fetchQuery(transitionsQueryOptions(issue.id))
      .then((transitions) => dropTargetsByColumn(columns, transitions, issue.status.id))
      .catch(() => {
        setMoveError(`Não foi possível carregar os status possíveis de ${issue.key}.`);
        return new Map<string, IssueTransition[]>();
      });
    targetsRequest.current = request;
    void request.then((targets) =>
      setDrag((current) => (current?.issue.id === issue.id ? { ...current, targets } : current)),
    );
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    const issue = active.data.current?.issue as JiraIssue | undefined;
    const request = targetsRequest.current;
    setDrag(null);
    targetsRequest.current = null;
    if (!issue || !over || !request) return;

    const transition = transitionForDrop(String(over.id), await request);
    if (!transition) return;
    move.mutate(
      { issue, transition },
      {
        onError: (error) =>
          setMoveError(`Não foi possível mover ${issue.key} para ${transition.to.name}: ${describeTransitionError(error)}`),
      },
    );
  }

  function dragStateOf(column: BoardColumn, laneKey?: string): ColumnDragState {
    if (!drag) return 'idle';
    if (laneKey !== undefined && laneOfIssue.get(drag.issue.id) !== laneKey) return 'outside';
    if (!drag.targets) return 'loading';
    if (drag.targets.has(column.id)) return 'target';
    return columnOfStatus.get(drag.issue.status.id) === column.id ? 'origin' : 'blocked';
  }

  function renderColumn(view: ColumnView, lane?: Swimlane) {
    const dragState = dragStateOf(view.column, lane?.key);
    const isOrigin = drag?.targets && dragState !== 'outside' && columnOfStatus.get(drag.issue.status.id) === view.column.id;
    return (
      <KanbanColumn
        key={view.column.id}
        view={view}
        dragState={dragState}
        targets={dragState === 'target' ? drag?.targets?.get(view.column.id) : undefined}
        currentStatus={isOrigin ? drag!.issue.status : undefined}
        isFiltered={isFiltered}
        canDrag={canDrag}
        onOpenIssue={onOpenIssue}
        variant={lane ? 'lane' : 'board'}
        scope={lane?.key}
        laneLabel={lane ? (lane.story?.key ?? 'Outras issues') : undefined}
        footer={!lane && loadMore?.columnIds.has(view.column.id) ? loadMore.content : undefined}
      />
    );
  }

  return (
    <div className={styles.wrapper}>
      {moveError && (
        <Notice tone="error" className={styles.error}>
          {moveError}
        </Notice>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        accessibility={{ announcements, screenReaderInstructions }}
        onDragStart={handleDragStart}
        onDragEnd={(event) => void handleDragEnd(event)}
        onDragCancel={() => {
          setDrag(null);
          targetsRequest.current = null;
        }}
      >
        <div className={cx(styles.frame, isRefreshing && styles.refreshing)} aria-busy={isRefreshing}>
          <div className={styles.board} data-dragging={drag ? '' : undefined}>
            {/* Cresce com a coluna mais comprida e estica as outras até ela: dá para soltar o card em
                qualquer altura, mesmo com o quadro rolado até o fim de uma coluna longa. */}
            {lanes ? (
              <div className={styles.lanes}>
                {lanes.map((lane) => (
                  <KanbanSwimlane
                    key={lane.key}
                    lane={lane}
                    isCollapsed={collapsedLanes.has(lane.key)}
                    onToggle={toggleLane}
                    renderColumn={(view) => renderColumn(view, lane)}
                    onOpenIssue={onOpenIssue}
                  />
                ))}
                {loadMore && <div className={styles.lanesFooter}>{loadMore.content}</div>}
              </div>
            ) : (
              <div className={styles.columns}>{views.map((view) => renderColumn(view))}</div>
            )}
          </div>
          {isRefreshing && <RefreshOverlay />}
        </div>
        <DragOverlay dropAnimation={null}>{drag && <KanbanCardView issue={drag.issue} isOverlay />}</DragOverlay>
      </DndContext>
    </div>
  );
}
