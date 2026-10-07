import { PencilSimple } from '@phosphor-icons/react';
import { type KeyboardEvent, useState } from 'react';
import styles from './DashboardNameField.module.css';

interface DashboardNameFieldProps {
  name: string;
  onRename: (name: string) => void;
}

/** Nome do dashboard, editável no próprio título: Enter ou sair do campo salvam; Esc desfaz. */
export function DashboardNameField({ name, onRename }: DashboardNameFieldProps) {
  const [draft, setDraft] = useState(name);
  const [lastName, setLastName] = useState(name);
  if (name !== lastName) {
    setLastName(name);
    setDraft(name);
  }

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    else setDraft(name);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') {
      setDraft(name);
      // Sai do campo sem salvar: o blur vê o nome de volta.
      requestAnimationFrame(() => (event.target as HTMLInputElement).blur());
    }
  }

  return (
    <label className={styles.field} title="Clique para renomear o dashboard">
      <input
        className={styles.input}
        value={draft}
        maxLength={60}
        aria-label="Nome do dashboard"
        size={Math.max(8, draft.length)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />
      <PencilSimple size={14} weight="bold" className={styles.icon} aria-hidden />
    </label>
  );
}
