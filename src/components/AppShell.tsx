import { SidebarSimple } from '@phosphor-icons/react';
import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useColumnResize } from '../hooks/useColumnResize';
import { cx } from '../lib/cx';
import { SIDEBAR_WIDTH, useSidebarStore } from '../store/useSidebarStore';
import styles from './AppShell.module.css';
import { Button } from './Button';
import { SidebarRail } from './SidebarRail';

/** Espaço que sobra para a área principal quando a lateral é alargada. */
const MIN_MAIN_WIDTH = 480;

/** Largura útil da folha na impressão, em px: A4 deitada (297 mm) menos as margens do `@page` (global.css). */
const PRINT_AREA_WIDTH = 1040;

interface AppShellProps {
  /** Conteúdo da lateral: filtros nas ferramentas, menu na página inicial. */
  sidebar: ReactNode;
  /** Fim da lateral (conta conectada). */
  sidebarFooter?: ReactNode;
  children: ReactNode;
  mainClassName?: string;
}

/**
 * Lateral à esquerda (redimensionável pela borda e que pode ser escondida) e
 * área principal; vira uma coluna só em telas estreitas.
 */
export function AppShell({ sidebar, sidebarFooter, children, mainClassName }: AppShellProps) {
  const width = useSidebarStore((state) => state.width);
  const collapsed = useSidebarStore((state) => state.collapsed);
  const setWidth = useSidebarStore((state) => state.setWidth);
  const setCollapsed = useSidebarStore((state) => state.setCollapsed);
  const pageRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const sidebarId = useId();
  const [motion, setMotion] = useState(false);

  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setMotion(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  // Impressão igual à tela: a área principal sai com a largura que tem na tela
  // (as mesmas colunas e quebras de linha), reduzida para caber na folha.
  // Vale para o "Imprimir" das telas e para o Ctrl/⌘ + P.
  useEffect(() => {
    function fitToPage() {
      const main = mainRef.current;
      if (!main) return;
      const style = getComputedStyle(main);
      const width = main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (!(width > 0)) return;
      main.style.setProperty('--print-width', `${width}px`);
      main.style.setProperty('--print-zoom', String(Math.min(1, PRINT_AREA_WIDTH / width)));
    }
    window.addEventListener('beforeprint', fitToPage);
    return () => window.removeEventListener('beforeprint', fitToPage);
  }, []);

  // Durante o arrasto a largura vai direto na variável CSS (sem re-renderizar a tela inteira).
  function previewWidth(next: number | null) {
    const style = pageRef.current?.style;
    if (!style) return;
    if (next === null) style.removeProperty('--sidebar-width');
    else style.setProperty('--sidebar-width', `${next}px`);
  }

  function currentWidth(): number {
    const page = pageRef.current;
    const value = page ? parseFloat(getComputedStyle(page).getPropertyValue('--sidebar-width')) : NaN;
    return Number.isFinite(value) ? value : SIDEBAR_WIDTH.default;
  }

  const { handleProps } = useColumnResize({
    getWidth: currentWidth,
    getBounds: () => ({
      min: SIDEBAR_WIDTH.min,
      max: Math.max(SIDEBAR_WIDTH.min, Math.min(SIDEBAR_WIDTH.max, window.innerWidth - MIN_MAIN_WIDTH)),
    }),
    onPreview: previewWidth,
    onCommit: setWidth,
    onCancel: () => previewWidth(width),
    onReset: () => {
      previewWidth(null);
      setWidth(null);
    },
    onDragStart: () => pageRef.current?.setAttribute('data-resizing', ''),
    onDragEnd: () => pageRef.current?.removeAttribute('data-resizing'),
  });

  const style = width === null ? undefined : ({ '--sidebar-width': `${width}px` } as CSSProperties);

  function toggleCollapsed() {
    const next = !useSidebarStore.getState().collapsed;
    if (!motion) {
      setMotion(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setCollapsed(next));
      });
      return;
    }
    setCollapsed(next);
  }

  return (
    <div
      ref={pageRef}
      className={styles.page}
      style={style}
      data-collapsed={collapsed || undefined}
      data-motion={motion || undefined}
    >
      <div className={styles.sidebarFrame}>
        <div className={styles.clip}>
          <aside id={sidebarId} className={styles.sidebar} inert={collapsed} aria-hidden={collapsed || undefined}>
            <div className={styles.sidebarContent}>{sidebar}</div>
            {sidebarFooter}
          </aside>
          <SidebarRail collapsed={collapsed} className={styles.rail} />
        </div>
        <Button
          variant="secondary"
          className={`${styles.collapseButton} border-none! ${collapsed ? 'left-[50%]! translate-x-[-50%]!' : ''}`}
          icon={<SidebarSimple size={18} weight="bold" aria-hidden />}
          aria-label={collapsed ? 'Mostrar menu lateral' : 'Esconder menu lateral'}
          title={collapsed ? 'Mostrar menu lateral' : 'Esconder menu lateral'}
          aria-expanded={!collapsed}
          aria-controls={sidebarId}
          onClick={toggleCollapsed}
        />
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Largura do menu lateral"
          aria-valuemin={SIDEBAR_WIDTH.min}
          aria-valuemax={SIDEBAR_WIDTH.max}
          aria-valuenow={width ?? SIDEBAR_WIDTH.default}
          tabIndex={collapsed ? -1 : 0}
          aria-hidden={collapsed || undefined}
          title="Arraste para ajustar a largura do menu. Duplo clique restaura."
          className={styles.resizeHandle}
          {...handleProps}
        />
      </div>

      <main ref={mainRef} className={cx(styles.main, mainClassName)}>
        {children}
      </main>
    </div>
  );
}
