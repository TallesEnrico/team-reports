import { type CSSProperties, useRef } from 'react';
import { useColumnResize } from '../../../hooks/useColumnResize';
import { useBuilderStore } from '../store/useBuilderStore';
import type { Dashboard } from '../types';
import styles from './BuildView.module.css';
import { FlowCanvas } from './FlowCanvas';
import { PieceInspector } from './PieceInspector';

/** Larguras do painel da peça, em px. Mantenha `default` em sincronia com `--inspector-width` em BuildView.module.css. */
const INSPECTOR_WIDTH = { default: 340, min: 280, max: 720 };
/** O quadro nunca fica mais estreito que isto. */
const MIN_CANVAS_WIDTH = 420;

/** Montagem: o quadro de peças e, ao lado, a configuração da peça selecionada, com a divisa entre os dois. */
export function BuildView({ dashboard }: { dashboard: Dashboard }) {
  const selected = dashboard.nodes.filter((node) => node.selected);
  const width = useBuilderStore((state) => state.inspectorWidth);
  const setWidth = useBuilderStore((state) => state.setInspectorWidth);
  const canvasRevision = useBuilderStore((state) => state.canvasRevision);
  const buildRef = useRef<HTMLDivElement>(null);

  // Durante o arrasto a largura vai direto na variável CSS (sem re-renderizar o quadro a cada passo).
  function previewWidth(next: number | null) {
    const style = buildRef.current?.style;
    if (!style) return;
    if (next === null) style.removeProperty('--inspector-width');
    else style.setProperty('--inspector-width', `${next}px`);
  }

  function currentWidth(): number {
    const build = buildRef.current;
    const value = build ? parseFloat(getComputedStyle(build).getPropertyValue('--inspector-width')) : NaN;
    return Number.isFinite(value) ? value : INSPECTOR_WIDTH.default;
  }

  const { handleProps } = useColumnResize({
    edge: 'left',
    getWidth: currentWidth,
    getBounds: () => ({
      min: INSPECTOR_WIDTH.min,
      max: Math.max(
        INSPECTOR_WIDTH.min,
        Math.min(INSPECTOR_WIDTH.max, (buildRef.current?.clientWidth ?? 0) - MIN_CANVAS_WIDTH),
      ),
    }),
    onPreview: previewWidth,
    onCommit: setWidth,
    onCancel: () => previewWidth(width),
    onReset: () => {
      previewWidth(null);
      setWidth(null);
    },
    onDragStart: () => buildRef.current?.setAttribute('data-resizing', ''),
    onDragEnd: () => buildRef.current?.removeAttribute('data-resizing'),
  });

  return (
    <div
      ref={buildRef}
      className={styles.build}
      style={width === null ? undefined : ({ '--inspector-width': `${width}px` } as CSSProperties)}
    >
      {/* Por dashboard: a vista inicial (enquadrar tudo ou a peça a editar) recomeça ao trocar, e quando a IA troca as peças. */}
      <FlowCanvas key={`${dashboard.id}:${canvasRevision}`} dashboard={dashboard} />
      {/* `nokey`: Backspace e setas na divisa não mexem nas peças do quadro. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Largura do painel da peça"
        aria-valuemin={INSPECTOR_WIDTH.min}
        aria-valuemax={INSPECTOR_WIDTH.max}
        aria-valuenow={width ?? INSPECTOR_WIDTH.default}
        tabIndex={0}
        title="Arraste para ajustar a largura do painel. Duplo clique restaura."
        className={`${styles.splitter} nokey`}
        {...handleProps}
      />
      <PieceInspector node={selected.length === 1 ? selected[0] : undefined} />
    </div>
  );
}
