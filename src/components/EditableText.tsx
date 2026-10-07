import { PencilSimple } from '@phosphor-icons/react';
import { type KeyboardEvent, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { cx } from '../lib/cx';
import styles from './EditableText.module.css';

interface EditableTextProps {
  value: string;
  /** Nome do campo em minúsculas ("título", "descrição"), nos rótulos de acessibilidade. */
  label: string;
  /**
   * Várias linhas (descrição): Shift + Enter quebra a linha. Sem ele (título), o
   * campo também é um textarea, que cresce com o texto, mas sem quebra de linha.
   */
  multiline?: boolean;
  /** Mensagem quando o valor não pode ficar vazio (ex: título). */
  requiredMessage?: string;
  canEdit: boolean;
  isEditing: boolean;
  onEditingChange: (isEditing: boolean) => void;
  /** Só é chamado quando o valor muda. */
  onSave: (value: string) => void;
  isSaving: boolean;
  error?: string | null;
  /** Aviso durante a edição (ex: a descrição é salva como texto simples). */
  hint?: ReactNode;
  className?: string;
  /** O valor fora da edição. */
  children: ReactNode;
}

/**
 * Texto do modal da issue editável no lugar: dois cliques (ou o lápis, pelo
 * teclado) abrem a edição. Enter ou sair do campo salvam; Esc descarta o que foi
 * escrito. Em várias linhas, Shift + Enter quebra a linha.
 */
export function EditableText({ canEdit, isEditing, onEditingChange, label, className, children, ...form }: EditableTextProps) {
  if (isEditing) {
    return <EditableTextForm {...form} label={label} className={className} onCancel={() => onEditingChange(false)} />;
  }
  if (!canEdit) return <div className={className}>{children}</div>;
  return (
    <div className={cx(styles.display, className)} onDoubleClick={() => onEditingChange(true)} title="Dois cliques para editar">
      {children}
      <button type="button" className={styles.editButton} aria-label={`Editar ${label}`} onClick={() => onEditingChange(true)}>
        <PencilSimple size={14} weight="bold" aria-hidden />
      </button>
    </div>
  );
}

interface EditableTextFormProps extends Pick<EditableTextProps, 'value' | 'label' | 'multiline' | 'requiredMessage' | 'onSave' | 'isSaving' | 'error' | 'hint' | 'className'> {
  onCancel: () => void;
}

// À parte: o rascunho recomeça do valor atual a cada edição.
function EditableTextForm({ value, label, multiline, requiredMessage, onSave, isSaving, error, hint, className, onCancel }: EditableTextFormProps) {
  const [draft, setDraft] = useState(value);
  const [emptyError, setEmptyError] = useState(false);
  // Esc descarta: o blur que pode vir quando o campo some não salva.
  const isDiscarded = useRef(false);
  const lineRef = useRef<HTMLTextAreaElement>(null);

  // O campo de uma linha cresce com o texto (um título longo quebra em várias linhas visuais).
  useLayoutEffect(() => {
    const field = lineRef.current;
    if (!field) return;
    field.style.height = 'auto';
    const borders = field.offsetHeight - field.clientHeight;
    field.style.height = `${field.scrollHeight + borders}px`;
  }, [draft]);

  function save() {
    if (isSaving || isDiscarded.current) return;
    const next = multiline ? draft.trim() : draft.trim().replace(/\s+/g, ' ');
    if (!next && requiredMessage) return setEmptyError(true);
    if (next === value.trim()) return onCancel();
    onSave(next);
  }

  function handleKeyDown(event: KeyboardEvent) {
    // Enter que confirma um acento ou caractere composto não salva.
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      // Sai só da edição, sem salvar o que foi escrito; sem isto, o Esc fecharia o modal.
      event.preventDefault();
      if (isSaving) return;
      isDiscarded.current = true;
      onCancel();
    } else if (event.key === 'Enter' && !(multiline && event.shiftKey)) {
      event.preventDefault();
      save();
    }
  }

  const message = emptyError ? requiredMessage : error;
  const fieldProps = {
    value: draft,
    'aria-label': label.charAt(0).toUpperCase() + label.slice(1),
    'aria-invalid': Boolean(message) || undefined,
    autoFocus: true,
    // Só leitura (e não desabilitado) enquanto salva: desabilitar tiraria o foco do campo.
    readOnly: isSaving,
    onKeyDown: handleKeyDown,
    onBlur: save,
  };

  return (
    <div className={cx(styles.form, className)}>
      {multiline ? (
        <textarea
          {...fieldProps}
          className={cx('input', styles.textarea)}
          rows={Math.min(16, Math.max(6, draft.split('\n').length + 1))}
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : (
        <textarea
          {...fieldProps}
          ref={lineRef}
          rows={1}
          className={cx('input', styles.input)}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            // Sem quebra de linha: o que vier colado com quebras vira espaço (Enter salva).
            setDraft(event.target.value.replace(/\r?\n/g, ' '));
            setEmptyError(false);
          }}
        />
      )}
      {message && (
        <p role="alert" className={styles.error}>
          {message}
        </p>
      )}
      {hint && <p className={styles.hint}>{hint}</p>}
      <p className={styles.keys}>
        {isSaving
          ? 'Salvando…'
          : multiline
            ? 'Enter ou sair do campo salvam · Shift + Enter quebra a linha · Esc descarta'
            : 'Enter ou sair do campo salvam · Esc descarta'}
      </p>
    </div>
  );
}
