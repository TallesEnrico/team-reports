import { X } from '@phosphor-icons/react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from '@xyflow/react';
import { cx } from '../../../lib/cx';
import { useBuilderStore } from '../store/useBuilderStore';
import { useBuilderContext } from './BuilderContext';
import styles from './PieceEdge.module.css';

/** Ligação entre duas peças: tracejada e em movimento enquanto os dados chegam; selecionada, mostra o "×". */
export function PieceEdge({ id, source, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected }: EdgeProps) {
  const { results } = useBuilderContext();
  const changeEdges = useBuilderStore((state) => state.changeEdges);
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const sourceResult = results[source];
  const sourceState = sourceResult?.state;
  // Dados chegando (a primeira vez ou de novo, com os anteriores na tela): os traços andam.
  const isFlowing = sourceState === 'loading' || (sourceResult?.state === 'ready' && Boolean(sourceResult.isStale));

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={cx(styles.edge, isFlowing && styles.flowing, (sourceState !== 'ready' || isFlowing) && styles.waiting)}
        data-selected={selected || undefined}
        interactionWidth={18}
      />
      {selected && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className={cx(styles.remove, 'nodrag nopan')}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            aria-label="Remover a ligação"
            title="Remover a ligação (Delete)"
            onClick={() => changeEdges([{ type: 'remove', id }])}
          >
            <X size={12} weight="bold" aria-hidden />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
