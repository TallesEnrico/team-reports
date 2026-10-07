import { Kanban, Table } from '@phosphor-icons/react';
import type { KanbanViewMode } from '../types';
import styles from './ViewModeToggle.module.css';

const MODES: { value: KanbanViewMode; label: string; Icon: typeof Kanban }[] = [
  { value: 'board', label: 'Quadro', Icon: Kanban },
  { value: 'sheet', label: 'Planilha', Icon: Table },
];

interface ViewModeToggleProps {
  value: KanbanViewMode;
  onChange: (mode: KanbanViewMode) => void;
}

/** Visualização do quadro: colunas com cards ou planilha. */
export function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  return (
    <div className={styles.toggle} role="group" aria-label="Visualização">
      {MODES.map(({ value: mode, label, Icon }) => (
        <button key={mode} type="button" aria-pressed={value === mode} onClick={() => onChange(mode)}>
          <Icon size={14} weight="bold" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
