import '@xyflow/react/dist/style.css';
import { Clock, ListChecks, WarningCircle } from '@phosphor-icons/react';
import {
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type EdgeTypes,
  type FinalConnectionState,
  MiniMap,
  type NodeTypes,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import { type DragEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '../../../components/Button';
import { PIECE_ORDER, PIECES } from '../lib/catalog';
import { checkConnection } from '../lib/graph';
import { useBuilderStore } from '../store/useBuilderStore';
import type { BuilderEdge, BuilderNode, Dashboard, PieceKind } from '../types';
import styles from './FlowCanvas.module.css';
import { PieceEdge } from './PieceEdge';
import { PieceNode } from './PieceNode';

/** Tipo de dado do arrasto de uma peça da paleta para o quadro. */
export const PIECE_DRAG_TYPE = 'application/x-team-piece';

// Fora do componente: o React Flow pede tipos estáveis.
const NODE_TYPES: NodeTypes = Object.fromEntries(PIECE_ORDER.map((kind) => [kind, PieceNode]));
const EDGE_TYPES: EdgeTypes = { piece: PieceEdge };
const DEFAULT_EDGE_OPTIONS = { type: 'piece' };

const MINIMAP_COLORS = { source: '#9ec5f4', transform: '#f2dc9c', visual: '#b9d4b4' };

/** Quanto tempo o motivo de uma ligação recusada fica na tela. */
const HINT_MS = 4500;

function isPieceKind(value: string): value is PieceKind {
  // `in` aceitaria nomes que todo objeto herda (ex: "constructor").
  return Object.hasOwn(PIECES, value);
}

/**
 * O último dashboard mostrado no quadro (e a posição dele na lista): ao trocar de
 * dashboard, as peças do novo entram com uma animação, na direção da lista.
 * Fora do componente porque o quadro é montado de novo a cada troca.
 */
let lastShown: { id: string; index: number } | null = null;

type Entrance = 'from-below' | 'from-above';

/** Como as peças entram: só ao trocar de dashboard (abrir a tela ou alternar Montar/Dashboard não anima). */
function entranceFor(dashboardId: string): Entrance | null {
  const index = useBuilderStore.getState().dashboards.findIndex((dashboard) => dashboard.id === dashboardId);
  if (!lastShown || lastShown.id === dashboardId) return null;
  // Indo para um dashboard mais abaixo na lista, as peças sobem; para um mais acima, descem.
  return index > lastShown.index ? 'from-below' : 'from-above';
}

/** O quadro de montagem: as peças, as ligações entre elas, o zoom e o arrasto da paleta. */
export function FlowCanvas({ dashboard }: { dashboard: Dashboard }) {
  const changeNodes = useBuilderStore((state) => state.changeNodes);
  const changeEdges = useBuilderStore((state) => state.changeEdges);
  const connect = useBuilderStore((state) => state.connect);
  const addPiece = useBuilderStore((state) => state.addPiece);
  const { screenToFlowPosition } = useReactFlow<BuilderNode, BuilderEdge>();
  const [hint, setHint] = useState<string | null>(null);
  const { nodes, edges } = dashboard;
  const [entrance] = useState(() => entranceFor(dashboard.id));

  useEffect(() => {
    lastShown = {
      id: dashboard.id,
      index: useBuilderStore.getState().dashboards.findIndex((item) => item.id === dashboard.id),
    };
  }, [dashboard.id]);
  // Ao abrir (ex: "Editar" num bloco do dashboard), a vista vai para a peça selecionada; sem ela, mostra tudo.
  const [fitViewOptions] = useState(() => {
    const selected = nodes.filter((node) => node.selected).map((node) => ({ id: node.id }));
    return selected.length > 0 ? { nodes: selected, maxZoom: 1, padding: 1 } : { padding: 0.15, maxZoom: 1 };
  });

  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(null), HINT_MS);
    return () => window.clearTimeout(timer);
  }, [hint]);

  const isValidConnection = useCallback(
    (connection: Connection | BuilderEdge) => checkConnection(connection, nodes, edges).ok,
    [nodes, edges],
  );

  // Soltou a ligação numa peça que não encaixa: diz por quê.
  const handleConnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid || !state.fromNode || !state.toNode) return;
      const fromOutput = state.fromHandle?.type === 'source';
      const connection = fromOutput
        ? { source: state.fromNode.id, target: state.toNode.id }
        : { source: state.toNode.id, target: state.fromNode.id };
      const check = checkConnection(connection, nodes, edges);
      if (!check.ok) setHint(check.reason);
    },
    [nodes, edges],
  );

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes(PIECE_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    const kind = event.dataTransfer.getData(PIECE_DRAG_TYPE);
    if (!isPieceKind(kind)) return;
    event.preventDefault();
    // A peça fica com o canto onde o mouse soltou, um pouco para dentro.
    const position = screenToFlowPosition({ x: event.clientX - 40, y: event.clientY - 24 });
    addPiece(kind, { position });
  }

  function addSource(kind: PieceKind) {
    addPiece(kind, { position: { x: 0, y: 0 }, avoidOverlap: true });
  }

  return (
    <div className={styles.canvas} data-entrance={entrance ?? undefined} onDragOver={handleDragOver} onDrop={handleDrop}>
      <ReactFlow<BuilderNode, BuilderEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        onNodesChange={changeNodes}
        onEdgesChange={changeEdges}
        onConnect={connect}
        isValidConnection={isValidConnection}
        onConnectEnd={handleConnectEnd}
        connectionRadius={36}
        fitView
        fitViewOptions={fitViewOptions}
        minZoom={0.2}
        maxZoom={1.75}
        deleteKeyCode={['Backspace', 'Delete']}
        snapToGrid
        snapGrid={[10, 10]}
        proOptions={{ hideAttribution: false }}
        aria-label="Quadro de montagem do dashboard"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="var(--border-strong)" />
        <Controls showInteractive={false} position="bottom-left" className={styles.controls} />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          className={styles.minimap}
          style={{ width: 168, height: 112 }}
          nodeColor={(node) => MINIMAP_COLORS[PIECES[node.type as PieceKind]?.category ?? 'source']}
          nodeBorderRadius={6}
          ariaLabel="Miniatura do quadro"
        />
      </ReactFlow>

      {nodes.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Comece por uma peça de dados</p>
          <p className={styles.emptyText}>
            Arraste as peças da lateral para o quadro e ligue a saída (a aba à direita) de uma à entrada (o encaixe à
            esquerda) da outra. Ou comece por aqui:
          </p>
          <div className={styles.emptyActions}>
            <Button icon={<Clock size={16} weight="bold" aria-hidden />} onClick={() => addSource('worklogs')}>
              Horas lançadas
            </Button>
            <Button icon={<ListChecks size={16} weight="bold" aria-hidden />} onClick={() => addSource('issues')}>
              Issues
            </Button>
          </div>
        </div>
      )}

      {hint && (
        <p className={styles.hint} role="status">
          <WarningCircle size={16} weight="bold" aria-hidden />
          {hint}
        </p>
      )}
    </div>
  );
}
