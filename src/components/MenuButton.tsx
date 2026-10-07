import { CaretDown } from '@phosphor-icons/react';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Button } from './Button';
import styles from './MenuButton.module.css';

export interface MenuItem {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  /** `danger`: ação que apaga algo (ex: excluir), em vermelho. */
  tone?: 'danger';
  onSelect: () => void;
}

interface MenuButtonProps {
  /** Texto do botão; com `iconOnly`, o nome dele para leitores de tela e a dica do mouse. */
  label: ReactNode;
  icon?: ReactNode;
  items: MenuItem[];
  disabled?: boolean;
  /** Só o ícone, sem texto nem seta (ex: o botão de opções "⋯"). */
  iconOnly?: boolean;
  /** Título no topo do menu (ex: a qual item as opções se referem). */
  heading?: ReactNode;
  className?: string;
}

/** Botão que abre um menu de ações (padrão WAI-ARIA "menu button"). */
export function MenuButton({ label, icon, items, disabled, iconOnly = false, heading, className }: MenuButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!isOpen) return;
    itemRefs.current[0]?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  function close({ returnFocus }: { returnFocus: boolean }) {
    setIsOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = itemRefs.current.findIndex((item) => item === document.activeElement);
    const focusAt = (index: number) => itemRefs.current[(index + items.length) % items.length]?.focus();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusAt(current + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusAt(current - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusAt(items.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        close({ returnFocus: true });
        break;
      case 'Tab':
        close({ returnFocus: false });
        break;
    }
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <Button
        ref={triggerRef}
        icon={icon}
        disabled={disabled}
        variant={iconOnly ? 'ghost' : undefined}
        className={className}
        aria-label={iconOnly && typeof label === 'string' ? label : undefined}
        title={iconOnly && typeof label === 'string' ? label : undefined}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        {!iconOnly && (
          <>
            {label}
            <CaretDown size={12} weight="bold" className={styles.caret} aria-hidden />
          </>
        )}
      </Button>

      {isOpen && (
        <div id={menuId} role="menu" className={styles.menu} onKeyDown={handleMenuKeyDown}>
          {heading && (
            <p className={styles.heading} aria-hidden>
              {heading}
            </p>
          )}
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={styles.item}
              data-tone={item.tone}
              onClick={() => {
                close({ returnFocus: true });
                item.onSelect();
              }}
            >
              {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
              <span className={styles.itemText}>
                <span className={styles.itemLabel}>{item.label}</span>
                {item.description && <span className={styles.itemDescription}>{item.description}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
