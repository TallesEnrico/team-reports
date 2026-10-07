import { ArrowLeft } from '@phosphor-icons/react';
import { type FocusEvent, type KeyboardEvent, type PointerEvent, useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import styles from './SidebarHeader.module.css';
import { JiraSiteLogo } from './JiraSiteLogo';
import { ToolNavList } from './ToolNavList';

/** Espera antes de abrir: o menu não pisca quando o mouse só atravessa o botão ou o logo. */
const OPEN_DELAY_MS = 120;
/** Espera antes de fechar: dá tempo de levar o mouse até o menu. */
const CLOSE_DELAY_MS = 220;

/**
 * Topo da lateral, igual em todas as telas: o logo do Time (o do site do
 * Jira), que leva à página inicial, e, fora dela, o botão "Início" ao lado e o menu das
 * ferramentas (abre com o mouse sobre o botão ou o logo, ou com o foco do teclado).
 */
export function SidebarHeader() {
  const pathname = useLocation().pathname;
  const hideNavigationMenu = pathname === '/' || pathname.includes('/settings');

  return (
    <header className={styles.header}>
      {hideNavigationMenu ? (
        <NavLink to="/" end className={styles.homeLink} title="Ir para o início">
          <JiraSiteLogo alt="Time: ir para o início" className={styles.logo} />
        </NavLink>
      ) : (
        <NavigationMenu />
      )}
    </header>
  );
}

/**
 * O botão "Início" e o logo, com o menu das ferramentas que os dois abrem. O
 * clique em qualquer um continua levando ao início.
 */
function NavigationMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const backRef = useRef<HTMLAnchorElement>(null);
  const logoRef = useRef<HTMLAnchorElement>(null);
  const timer = useRef<number | undefined>(undefined);
  /** Quem abriu o menu pelo teclado: o Esc devolve o foco a ele. */
  const lastTrigger = useRef<HTMLAnchorElement | null>(null);
  /** O foco volta ao botão ou ao logo pelo Esc: esse foco não reabre o menu. */
  const isReturningFocus = useRef(false);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function later(open: boolean, delay: number) {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setIsOpen(open), delay);
  }

  // Só o mouse abre no hover: no toque, o botão e o logo são só links para o início.
  function handlePointerEnter(event: PointerEvent) {
    if (event.pointerType === 'mouse') later(true, isOpen ? 0 : OPEN_DELAY_MS);
  }

  function handlePointerLeave(event: PointerEvent) {
    if (event.pointerType === 'mouse') later(false, CLOSE_DELAY_MS);
  }

  // Pelo teclado: o foco no botão ou no logo abre o menu, o Tab segue para os itens e sair dele fecha.
  function handleFocus(event: FocusEvent) {
    const isTrigger = event.target === backRef.current || event.target === logoRef.current;
    if (!isTrigger) return;
    lastTrigger.current = event.target as HTMLAnchorElement;
    if (isReturningFocus.current) {
      isReturningFocus.current = false;
      return;
    }
    if ((event.target as HTMLElement).matches(':focus-visible')) setIsOpen(true);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !isOpen) return;
    event.stopPropagation();
    setIsOpen(false);
    const trigger = lastTrigger.current ?? logoRef.current;
    if (trigger && document.activeElement !== trigger) {
      isReturningFocus.current = true;
      trigger.focus();
    }
  }

  const triggerProps = { 'aria-expanded': isOpen, 'aria-controls': isOpen ? menuId : undefined };

  return (
    <div
      className={styles.navigation}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      {/* Sem `title`: a dica do navegador ficaria por cima do menu. */}
      <Link ref={backRef} to="/" className={styles.backLink} aria-label="Voltar para a página inicial" {...triggerProps}>
        <ArrowLeft size={14} weight="bold" aria-hidden />
      </Link>
      <NavLink ref={logoRef} to="/" end className={styles.homeLink} {...triggerProps}>
        <JiraSiteLogo alt="Time: ir para o início" className={styles.logo} />
      </NavLink>
      {isOpen && (
        <nav id={menuId} className={styles.menu} aria-label="Ferramentas">
          <p className={styles.menuHeading}>Ir para</p>
          <ToolNavList size="compact" includeHome onNavigate={() => setIsOpen(false)} />
        </nav>
      )}
    </div>
  );
}
