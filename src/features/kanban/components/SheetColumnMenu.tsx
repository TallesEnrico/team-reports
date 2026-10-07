import { Columns, MagnifyingGlass } from '@phosphor-icons/react';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { REQUIRED_SHEET_COLUMNS, SHEET_COLUMNS } from '../lib/sheetColumns';
import type { SheetColumnKey } from '../types';
import styles from './SheetColumnMenu.module.css';

interface SheetColumnMenuProps {
  /** Colunas escolhidas (a chave aparece sempre). */
  value: SheetColumnKey[];
  onChange: (columns: SheetColumnKey[]) => void;
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Botão do canto do cabeçalho da planilha que abre a escolha das colunas: a
 * pesquisa, uma caixa de marcar por coluna (na ordem da planilha) e quantas
 * aparecem. O painel vai para o <body> (posição fixa, abaixo do botão): dentro
 * da moldura da planilha, ele seria cortado pela rolagem dela.
 */
export function SheetColumnMenu({ value, onChange }: SheetColumnMenuProps) {
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const isOpen = position !== null;

  const visible = new Set<SheetColumnKey>([...REQUIRED_SHEET_COLUMNS, ...value]);
  const query = normalize(search.trim());
  const shown = SHEET_COLUMNS.filter((column) => !query || normalize(column.label).includes(query));

  function open() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSearch('');
    setPosition({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  }

  function close({ returnFocus }: { returnFocus: boolean }) {
    setPosition(null);
    if (returnFocus) triggerRef.current?.focus();
  }

  // Fecha com clique fora; rolar a página ou mudar o tamanho da janela tiraria o painel do lugar.
  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setPosition(null);
    }
    function handleMove(event: Event) {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return;
      setPosition(null);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('scroll', handleMove, true);
    window.addEventListener('resize', handleMove);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', handleMove, true);
      window.removeEventListener('resize', handleMove);
    };
  }, [isOpen]);

  function toggle(key: SheetColumnKey, checked: boolean) {
    // Na ordem da planilha, sem as obrigatórias (que aparecem de qualquer jeito).
    const next = SHEET_COLUMNS.map((column) => column.key).filter((candidate) =>
      candidate === key ? checked : visible.has(candidate) && !REQUIRED_SHEET_COLUMNS.includes(candidate),
    );
    onChange(next);
  }

  function handlePanelKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    close({ returnFocus: true });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-label="Escolher as colunas"
        title="Escolher as colunas"
        onClick={() => (isOpen ? close({ returnFocus: false }) : open())}
      >
        <Columns size={16} weight="bold" aria-hidden />
      </button>

      {position &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label="Colunas da planilha"
            className={styles.panel}
            style={{ top: position.top, right: position.right }}
            onKeyDown={handlePanelKeyDown}
          >
            <div className={styles.search}>
              <MagnifyingGlass size={16} weight="bold" className={styles.searchIcon} aria-hidden />
              <input
                className={`input ${styles.searchInput}`}
                type="search"
                placeholder="Pesquisar colunas"
                aria-label="Pesquisar colunas"
                autoComplete="off"
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            {shown.length > 0 ? (
              <ul className={styles.list}>
                {shown.map((column) => {
                  const isRequired = REQUIRED_SHEET_COLUMNS.includes(column.key);
                  return (
                    <li key={column.key}>
                      <label className={styles.option} title={isRequired ? 'Aparece sempre: abre o modal da issue' : undefined}>
                        <input
                          type="checkbox"
                          checked={visible.has(column.key)}
                          disabled={isRequired}
                          onChange={(event) => toggle(column.key, event.target.checked)}
                        />
                        <span>{column.label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.empty}>Nenhuma coluna com esse nome.</p>
            )}

            <footer className={styles.footer}>
              {visible.size} de {SHEET_COLUMNS.length}
            </footer>
          </div>,
          document.body,
        )}
    </>
  );
}
