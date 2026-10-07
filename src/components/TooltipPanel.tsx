import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';
import styles from './TooltipPanel.module.css';

const ANCHOR_GAP = 6;
const VIEWPORT_MARGIN = 8;

interface TooltipPanelProps {
  /** Elemento a que o tooltip se refere. */
  anchor: HTMLElement;
  /** Para `aria-describedby` no elemento de origem. */
  id?: string;
  /** Lado preferido; vai para o outro quando não cabe. */
  placement?: 'top' | 'bottom';
  className?: string;
  children: ReactNode;
}

/**
 * Caixa de tooltip fixa na janela, fora de quem rola (portal): não é cortada
 * pela rolagem de tabelas e quadros. Centralizada no elemento de origem e
 * sempre dentro da janela.
 */
export function TooltipPanel({ anchor, id, placement = 'top', className, children }: TooltipPanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Mede o tooltip já renderizado e posiciona antes da pintura.
  useLayoutEffect(() => {
    const tooltip = ref.current;
    if (!tooltip) return;
    const target = anchor.getBoundingClientRect();
    const { width, height } = tooltip.getBoundingClientRect();

    const above = target.top - ANCHOR_GAP - height;
    const below = target.bottom + ANCHOR_GAP;
    const fitsAbove = above >= VIEWPORT_MARGIN;
    const fitsBelow = below + height <= window.innerHeight - VIEWPORT_MARGIN;
    const top = placement === 'top' ? (fitsAbove ? above : below) : fitsBelow || !fitsAbove ? below : above;
    const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(target.left + (target.width - width) / 2, maxLeft));

    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.left = `${Math.round(left)}px`;
  });

  return createPortal(
    <div ref={ref} id={id} role="tooltip" className={cx(styles.tooltip, className)}>
      {children}
    </div>,
    document.body,
  );
}
