import { type KeyboardEvent, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CATEGORY_LABELS, type NextPiece, PIECES } from '../lib/catalog';
import styles from './NextPieceMenu.module.css';

interface NextPieceMenuProps {
  anchor: HTMLElement;
  pieces: NextPiece[];
  onSelect: (piece: NextPiece) => void;
  onClose: () => void;
}

const GAP = 8;
const MARGIN = 8;

/**
 * Peças que encaixam na saída de uma peça (o "+" ao lado dela). Fica no <body>,
 * fora do zoom do quadro, ao lado do botão.
 */
export function NextPieceMenu({ anchor, pieces, onSelect, onClose }: NextPieceMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const target = anchor.getBoundingClientRect();
    const { width, height } = menu.getBoundingClientRect();
    const fitsRight = target.right + GAP + width <= window.innerWidth - MARGIN;
    const left = fitsRight ? target.right + GAP : Math.max(MARGIN, target.left - GAP - width);
    const top = Math.max(MARGIN, Math.min(target.top + target.height / 2 - 40, window.innerHeight - height - MARGIN));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    itemRefs.current[0]?.focus();
  }, [anchor]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !anchor.contains(target)) onClose();
    }
    // Zoom ou rolagem do quadro tiram o botão de baixo do menu.
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('wheel', onClose, { passive: true });
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('wheel', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // O menu está num portal, mas o evento sobe pela árvore do React até a peça: as setas moveriam a peça.
    event.stopPropagation();
    const current = itemRefs.current.findIndex((item) => item === document.activeElement);
    const focusAt = (index: number) => itemRefs.current[(index + pieces.length) % pieces.length]?.focus();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusAt(current + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusAt(current - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      anchor.focus();
    }
  }

  let lastCategory = '';
  return createPortal(
    <div ref={menuRef} className={`${styles.menu} nokey`} role="menu" aria-label="Encaixar a próxima peça" onKeyDown={handleKeyDown}>
      <p className={styles.heading}>Encaixar depois</p>
      {pieces.map((next, index) => {
        const { kind } = next;
        const piece = PIECES[kind];
        const Icon = piece.icon;
        const showCategory = piece.category !== lastCategory;
        lastCategory = piece.category;
        return (
          <div key={kind}>
            {showCategory && <p className={styles.category}>{CATEGORY_LABELS[piece.category]}</p>}
            <button
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => onSelect(next)}
            >
              <span className={styles.icon} data-category={piece.category}>
                <Icon size={14} weight="bold" aria-hidden />
              </span>
              <span className={styles.text}>
                <span className={styles.name}>{piece.name}</span>
                <span className={styles.description}>
                  {next.viaGroup ? 'Entra com um "Agrupar e cruzar" antes, já configurado.' : piece.description}
                </span>
              </span>
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
