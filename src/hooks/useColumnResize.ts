import { type KeyboardEvent, type PointerEvent, useRef } from 'react';

interface Bounds {
  min: number;
  max: number;
}

interface UseColumnResizeOptions {
  /** Largura atual renderizada, em px. */
  getWidth: () => number;
  getBounds: () => Bounds;
  /** Aplica a largura durante o arrasto sem passar pelo React (ex: variável CSS). */
  onPreview: (width: number) => void;
  /** Confirma a largura ao soltar, ou a cada passo do teclado. */
  onCommit: (width: number) => void;
  /** Desfaz o preview quando o arrasto termina sem mudança ou é cancelado com Esc. */
  onCancel: () => void;
  /** Duplo clique: volta à largura padrão. */
  onReset: () => void;
  /** Recebem a alça que iniciou o arrasto (útil quando várias alças controlam a mesma largura). */
  onDragStart?: (handle: HTMLElement) => void;
  onDragEnd?: (handle: HTMLElement) => void;
  /** Passo das setas do teclado, em px (Shift multiplica por 4). */
  step?: number;
  /**
   * Borda do elemento onde fica a alça: `right` (padrão: coluna, lateral) ou
   * `left` (painel à direita de outro: arrastar ou a seta para a esquerda alarga).
   */
  edge?: 'left' | 'right';
}

interface DragState {
  handle: HTMLElement;
  pointerId: number;
  startX: number;
  startWidth: number;
  width: number;
  bounds: Bounds;
  cancelOnEscape: (event: globalThis.KeyboardEvent) => void;
}

function clamp(width: number, { min, max }: Bounds): number {
  return Math.round(Math.min(max, Math.max(min, width)));
}

/**
 * Alça de redimensionamento de coluna (padrão "window splitter" do WAI-ARIA):
 * arrastar com mouse/toque, setas do teclado e duplo clique para restaurar.
 * Os `handleProps` podem ser espalhados em várias alças que controlam a mesma largura.
 */
export function useColumnResize(options: UseColumnResizeOptions) {
  const { getWidth, getBounds, onPreview, onCommit, onCancel, onReset, onDragStart, onDragEnd, step = 16, edge = 'right' } = options;
  const direction = edge === 'right' ? 1 : -1;
  const drag = useRef<DragState | null>(null);

  function finishDrag(commit: boolean) {
    const state = drag.current;
    if (!state) return;
    drag.current = null;

    window.removeEventListener('keydown', state.cancelOnEscape, true);
    if (state.handle.hasPointerCapture(state.pointerId)) state.handle.releasePointerCapture(state.pointerId);
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
    onDragEnd?.(state.handle);

    if (commit && state.width !== state.startWidth) onCommit(state.width);
    else onCancel();
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.focus();
    handle.setPointerCapture(event.pointerId);

    // Esc cancela de qualquer alça, inclusive das que não recebem foco.
    const cancelOnEscape = (keyEvent: globalThis.KeyboardEvent) => {
      if (keyEvent.key !== 'Escape') return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      finishDrag(false);
    };
    window.addEventListener('keydown', cancelOnEscape, true);

    const width = getWidth();
    drag.current = {
      handle,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
      width,
      bounds: getBounds(),
      cancelOnEscape,
    };
    // O cursor e o bloqueio de seleção valem para a página toda enquanto arrasta.
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    onDragStart?.(handle);
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const state = drag.current;
    if (!state || event.pointerId !== state.pointerId) return;
    const width = clamp(state.startWidth + direction * (event.clientX - state.startX), state.bounds);
    if (width === state.width) return;
    state.width = width;
    onPreview(width);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const bounds = getBounds();
    const amount = event.shiftKey ? step * 4 : step;
    const targets: Record<string, number> = {
      ArrowLeft: getWidth() - direction * amount,
      ArrowRight: getWidth() + direction * amount,
      Home: bounds.min,
      End: bounds.max,
    };
    if (!(event.key in targets)) return;

    event.preventDefault();
    const width = clamp(targets[event.key], bounds);
    onPreview(width);
    onCommit(width);
  }

  return {
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: () => finishDrag(true),
      onLostPointerCapture: () => finishDrag(true),
      onKeyDown,
      onDoubleClick: onReset,
    },
  };
}
