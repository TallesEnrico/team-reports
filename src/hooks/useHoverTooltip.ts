import { useCallback, useEffect, useRef, useState } from 'react';

/** Espera padrão antes de abrir: o tooltip não pisca enquanto o mouse só atravessa a tela. */
const DEFAULT_OPEN_DELAY_MS = 400;
/** Logo depois de fechar, o próximo abre sem espera: passar à célula vizinha só troca o conteúdo. */
const WARM_WINDOW_MS = 300;

export interface HoverTooltipTarget<T> {
  anchor: HTMLElement;
  data: T;
}

/**
 * Um único tooltip compartilhado por muitos elementos: abre com atraso no hover,
 * troca de alvo sem atraso e fecha ao rolar, redimensionar a janela ou com Esc.
 */
export function useHoverTooltip<T>({ openDelayMs = DEFAULT_OPEN_DELAY_MS }: { openDelayMs?: number } = {}) {
  const [target, setTarget] = useState<HoverTooltipTarget<T> | null>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const isShown = useRef(false);
  const lastHiddenAt = useRef(-Infinity);

  const show = useCallback((anchor: HTMLElement, data: T) => {
    window.clearTimeout(openTimer.current);
    const open = () => {
      isShown.current = true;
      setTarget({ anchor, data });
    };
    if (performance.now() - lastHiddenAt.current < WARM_WINDOW_MS) open();
    else openTimer.current = window.setTimeout(open, openDelayMs);
  }, [openDelayMs]);

  const hide = useCallback(() => {
    window.clearTimeout(openTimer.current);
    if (isShown.current) lastHiddenAt.current = performance.now();
    isShown.current = false;
    setTarget(null);
  }, []);

  useEffect(() => {
    if (!target) return;
    const hideOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    // Rolando a tabela ou a página, a célula sai de baixo do tooltip.
    window.addEventListener('scroll', hide, { capture: true, passive: true });
    window.addEventListener('resize', hide);
    window.addEventListener('keydown', hideOnEscape);
    return () => {
      window.removeEventListener('scroll', hide, { capture: true });
      window.removeEventListener('resize', hide);
      window.removeEventListener('keydown', hideOnEscape);
    };
  }, [target, hide]);

  useEffect(() => () => window.clearTimeout(openTimer.current), []);

  return { target, show, hide };
}
