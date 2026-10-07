import { PencilSimple } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import type { JiraUser } from '../api/jira-users';
import type { UserSource } from '../api/useUserOptionsQuery';
import styles from './EditableUserField.module.css';
import { UserPicker } from './UserPicker';

interface EditableUserFieldProps {
  /** Nome do campo em minúsculas ("responsável", "relator"), nos rótulos de acessibilidade. */
  label: string;
  user: JiraUser | undefined;
  source: UserSource;
  /** Aceita ficar sem ninguém (responsável). */
  allowNone?: boolean;
  canEdit: boolean;
  isEditing: boolean;
  onEditingChange: (isEditing: boolean) => void;
  /** Só é chamado quando a pessoa muda. */
  onSave: (user: JiraUser | null) => void;
  isSaving: boolean;
  error?: string | null;
  /** A pessoa fora da edição. */
  children: ReactNode;
}

/** Pessoa do modal da issue (responsável, relator) trocada no lugar: clique no lápis ou dois cliques. */
export function EditableUserField({
  label,
  user,
  source,
  allowNone = false,
  canEdit,
  isEditing,
  onEditingChange,
  onSave,
  isSaving,
  error,
  children,
}: EditableUserFieldProps) {
  return (
    <>
      {isEditing ? (
        <div className={styles.editing}>
          <UserPicker
            ariaLabel={label.charAt(0).toUpperCase() + label.slice(1)}
            source={source}
            value={user ?? null}
            allowNone={allowNone}
            autoFocus
            isDisabled={isSaving}
            onChange={(next) => {
              if ((next?.accountId ?? null) === (user?.accountId ?? null)) onEditingChange(false);
              else onSave(next);
            }}
            // Sair do campo sem escolher cancela (salvando, espera a resposta).
            onBlur={() => !isSaving && onEditingChange(false)}
            onEscape={() => !isSaving && onEditingChange(false)}
          />
          {isSaving && <span className={styles.saving}>Salvando…</span>}
        </div>
      ) : canEdit ? (
        <div className={styles.display} onDoubleClick={() => onEditingChange(true)} title="Dois cliques para trocar">
          {children}
          <button type="button" className={styles.editButton} aria-label={`Trocar ${label}`} onClick={() => onEditingChange(true)}>
            <PencilSimple size={13} weight="bold" aria-hidden />
          </button>
        </div>
      ) : (
        children
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </>
  );
}
