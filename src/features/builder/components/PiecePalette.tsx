import { DotsSixVertical } from '@phosphor-icons/react';
import { useReactFlow } from '@xyflow/react';
import type { DragEvent } from 'react';
import { CATEGORY_LABELS, needsGroup, PIECE_ORDER, PIECES } from '../lib/catalog';
import { sourceKindOf } from '../lib/describe';
import { shapeOf } from '../lib/graph';
import { useBuilderStore } from '../store/useBuilderStore';
import type { BuilderEdge, BuilderNode, PieceCategory, PieceKind } from '../types';
import { useBuilderContext } from './BuilderContext';
import { PIECE_DRAG_TYPE } from './FlowCanvas';
import styles from './PiecePalette.module.css';

const CATEGORIES: PieceCategory[] = ['source', 'transform', 'visual'];

/** Medidas de uma peça no quadro, para centralizar a vista nela. */
const PIECE_SIZE = { width: 252, height: 140 };

/**
 * Onde a peça nova encaixa: na saída da peça selecionada, se couber nela, direto
 * ou com um "Agrupar e cruzar" no meio (gráficos depois de dados sem agrupar).
 */
function attachTarget(
  kind: PieceKind,
  nodes: BuilderNode[],
  edges: BuilderEdge[],
): { node: BuilderNode; viaGroup: boolean } | undefined {
  const selected = nodes.filter((node) => node.selected);
  if (selected.length !== 1) return undefined;
  const [node] = selected;
  const accepts = PIECES[kind].accepts;
  if (!accepts || !PIECES[node.type].hasOutput) return undefined;
  const shape = shapeOf(node.id, nodes, edges);
  if (shape === 'unknown' || accepts.includes(shape)) return { node, viaGroup: false };
  return needsGroup(kind, shape) ? { node, viaGroup: true } : undefined;
}

/**
 * Peças para montar o dashboard, por categoria. Arraste para o quadro ou clique:
 * com uma peça selecionada, a nova já encaixa depois dela.
 */
export function PiecePalette() {
  const { nodes, edges } = useBuilderContext();
  const addPiece = useBuilderStore((state) => state.addPiece);
  const { screenToFlowPosition, setCenter, getZoom } = useReactFlow<BuilderNode, BuilderEdge>();

  function handleDragStart(event: DragEvent<HTMLButtonElement>, kind: PieceKind) {
    event.dataTransfer.setData(PIECE_DRAG_TYPE, kind);
    event.dataTransfer.effectAllowed = 'copy';
  }

  function handleClick(kind: PieceKind) {
    const target = attachTarget(kind, nodes, edges);
    const after = target?.node;
    const source = after ? sourceKindOf(after.id, nodes, edges) : undefined;
    // Sem peça para encaixar: perto do meio da área do quadro.
    const canvas = document.querySelector('.react-flow')?.getBoundingClientRect();
    const center = canvas
      ? screenToFlowPosition({ x: canvas.left + canvas.width / 2, y: canvas.top + canvas.height / 2 })
      : { x: 0, y: 0 };
    const id = addPiece(kind, {
      after: after?.id,
      source,
      position: { x: center.x - PIECE_SIZE.width / 2, y: center.y - PIECE_SIZE.height / 2 },
      avoidOverlap: true,
      viaGroup: target?.viaGroup,
    });
    const added = useBuilderStore.getState().dashboards.flatMap((dashboard) => dashboard.nodes).find((node) => node.id === id);
    if (added) {
      void setCenter(added.position.x + PIECE_SIZE.width / 2, added.position.y + PIECE_SIZE.height / 2, {
        zoom: getZoom(),
        duration: 300,
      });
    }
  }

  const selectedCount = nodes.filter((node) => node.selected).length;

  return (
    <>
      <hr className="h w-full text-mauve-200 my-12" />
      <section className={styles.palette} aria-labelledby="builder-palette-title">
        <h2 id="builder-palette-title" className={styles.heading}>
          Peças
        </h2>
        <p className={styles.hint}>
          Arraste para o quadro, ou clique{selectedCount === 1 ? ' para encaixar depois da peça selecionada' : ''}.
        </p>
        {CATEGORIES.map((category) => (
          <div key={category} className={styles.group}>
            <p className={styles.category} data-category={category}>
              {CATEGORY_LABELS[category]}
            </p>
            <ul className={styles.list}>
              {PIECE_ORDER.filter((kind) => PIECES[kind].category === category).map((kind) => {
                const piece = PIECES[kind];
                const Icon = piece.icon;
                return (
                  <li key={kind}>
                    <button
                      type="button"
                      draggable
                      className={styles.item}
                      data-category={category}
                      onDragStart={(event) => handleDragStart(event, kind)}
                      onClick={() => handleClick(kind)}
                      title={piece.description}
                    >
                      <span className={styles.icon}>
                        <Icon size={15} weight="bold" aria-hidden />
                      </span>
                      <span className={styles.text}>
                        <span className={styles.name}>{piece.name}</span>
                        <span className={styles.description}>{piece.description}</span>
                      </span>
                      <DotsSixVertical size={14} weight="bold" className={styles.grip} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </>
  );
}
