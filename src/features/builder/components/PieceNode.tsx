import { CheckCircle, CircleNotch, Copy, Plus, PuzzlePiece, Trash, WarningCircle } from '@phosphor-icons/react';
import { Handle, type NodeProps, NodeToolbar, Position, useReactFlow } from '@xyflow/react';
import { memo, useCallback, useRef, useState } from 'react';
import { cx } from '../../../lib/cx';
import { CATEGORY_LABELS, isVisualKind, type NextPiece, nextPieces, PIECES } from '../lib/catalog';
import { sourceKindOf, summarize } from '../lib/describe';
import { shapeOf } from '../lib/graph';
import { useBuilderStore } from '../store/useBuilderStore';
import type { BuilderNode, PieceKind, PieceResult, VisualConfig } from '../types';
import { useBuilderContext } from './BuilderContext';
import { NextPieceMenu } from './NextPieceMenu';
import styles from './PieceNode.module.css';
import { countLabel, PiecePreview } from './PiecePreview';

function StatusIcon({ result }: { result: PieceResult | undefined }) {
  if (!result || result.state === 'loading' || (result.state === 'ready' && result.isStale)) {
    return <CircleNotch size={14} weight="bold" className={cx(styles.status, styles.spinning)} aria-label="Buscando" />;
  }
  if (result.state === 'error') return <WarningCircle size={14} weight="fill" className={cx(styles.status, styles.error)} aria-label="Com erro" />;
  if (result.state === 'idle') return <PuzzlePiece size={14} weight="bold" className={cx(styles.status, styles.idle)} aria-label="Falta encaixar ou configurar" />;
  return <CheckCircle size={14} weight="fill" className={cx(styles.status, styles.ready)} aria-label="Pronta" />;
}

/**
 * Peça do quadro de montagem: entrada à esquerda (o encaixe), saída à direita
 * (a aba), o resumo da configuração e o que sai dela (contagem ou miniatura do
 * bloco). O "+" encaixa a próxima peça já ligada.
 */
function PieceNodeComponent({ id, type, data, selected }: NodeProps<BuilderNode>) {
  const context = useBuilderContext();
  const { results, nodes, edges } = context;
  const addPiece = useBuilderStore((state) => state.addPiece);
  const insertGroupBefore = useBuilderStore((state) => state.insertGroupBefore);
  const removePiece = useBuilderStore((state) => state.removePiece);
  const duplicatePiece = useBuilderStore((state) => state.duplicatePiece);
  const { fitView, getZoom } = useReactFlow();
  const addRef = useRef<HTMLButtonElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  const kind = type as PieceKind;
  const piece = PIECES[kind];
  const Icon = piece.icon;
  const result = results[id];
  const node = { id, type: kind, data } as BuilderNode;
  const ownData = result?.state === 'ready' ? result.data : undefined;
  // A fonte pela montagem: vale também enquanto a busca não terminou.
  const sourceKind = sourceKindOf(id, nodes, edges);
  const isConnected = edges.some((edge) => edge.target === id);
  const hasNext = edges.some((edge) => edge.source === id);
  const summary = summarize(node, {
    connectedSquad: context.connectedSquad,
    dashboardPeriod: context.dashboardPeriod,
    source: sourceKind,
    data: ownData,
  });

  function addNext(next: NextPiece) {
    setIsMenuOpen(false);
    const newId = addPiece(next.kind, { after: id, source: sourceKind, viaGroup: next.viaGroup });
    // Mostra a peça nova junto com esta, sem aproximar mais que o zoom atual.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => void fitView({ nodes: [{ id }, { id: newId }], duration: 300, maxZoom: getZoom(), padding: 0.3 })),
    );
  }

  let footer;
  if (!result || result.state === 'loading') {
    footer = <span className={styles.muted}>{piece.category === 'source' ? 'Buscando no Jira…' : 'Esperando os dados…'}</span>;
  } else if (result.state === 'error') {
    footer = <span className={styles.errorText}>{result.message}</span>;
  } else if (result.state === 'idle') {
    footer = (
      <span className={styles.idleText}>
        {result.message}
        {result.fix === 'insert-group' && (
          <button
            type="button"
            className={cx(styles.fix, 'nodrag nokey')}
            onClick={() => insertGroupBefore(id, sourceKind)}
          >
            Encaixar "Agrupar e cruzar"
          </button>
        )}
      </span>
    );
  } else {
    footer = (
      <span className={styles.count} data-stale={result.isStale || undefined}>
        {countLabel(result.data)}
        {result.isStale && ' · atualizando…'}
        {result.note && <WarningCircle size={12} weight="bold" className={styles.noteIcon} aria-label={result.note} />}
      </span>
    );
  }

  return (
    <div
      className={styles.piece}
      data-category={piece.category}
      data-selected={selected || undefined}
      data-state={result?.state ?? 'loading'}
    >
      <NodeToolbar isVisible={selected} position={Position.Top} offset={8} className={cx(styles.toolbar, 'nokey')}>
        <button type="button" onClick={() => duplicatePiece(id)} title="Duplicar a peça (recebe os mesmos dados)">
          <Copy size={14} weight="bold" aria-hidden /> Duplicar
        </button>
        <button type="button" onClick={() => removePiece(id)} title="Remover a peça (Delete)" data-danger>
          <Trash size={14} weight="bold" aria-hidden /> Remover
        </button>
      </NodeToolbar>

      {piece.accepts && (
        <Handle
          type="target"
          position={Position.Left}
          className={styles.socket}
          data-connected={isConnected || undefined}
          title="Entrada: ligue aqui a saída de outra peça"
        />
      )}

      <header className={styles.head}>
        <span className={styles.icon}>
          <Icon size={15} weight="bold" aria-hidden />
        </span>
        <span className={styles.titles}>
          <span className={styles.category}>{CATEGORY_LABELS[piece.category]}</span>
          <span className={styles.name}>{piece.name}</span>
        </span>
        <StatusIcon result={result} />
      </header>

      <p className={styles.summary} title={summary}>
        {summary}
      </p>

      {isVisualKind(kind) && ownData && (
        <div className={styles.preview}>
          <PiecePreview kind={kind} config={data as VisualConfig} data={ownData} />
        </div>
      )}

      <footer className={styles.footer}>{footer}</footer>

      {piece.hasOutput && (
        <>
          <Handle type="source" position={Position.Right} className={styles.tab} title="Saída: arraste até a entrada de outra peça" />
          <button
            ref={addRef}
            type="button"
            className={cx(styles.add, 'nodrag nopan nokey')}
            data-visible={!hasNext || selected || isMenuOpen || undefined}
            aria-label="Encaixar a próxima peça"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            title="Encaixar a próxima peça"
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <Plus size={12} weight="bold" aria-hidden />
          </button>
        </>
      )}

      {isMenuOpen && addRef.current && (
        <NextPieceMenu
          anchor={addRef.current}
          pieces={nextPieces(shapeOf(id, nodes, edges))}
          onSelect={addNext}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

export const PieceNode = memo(PieceNodeComponent);
