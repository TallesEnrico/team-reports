import { type KeyboardEvent, useId, useState } from 'react';
import { Button } from '../../../components/Button';
import { FormField } from '../../../components/FormField';
import styles from './InspectorFields.module.css';

interface JqlFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * JQL a mais, somada com AND. Só vale ao sair do campo (ou com ⌘/Ctrl + Enter):
 * cada mudança é uma busca nova no Jira.
 */
export function JqlField({ value, onChange }: JqlFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  // Outra peça escolhida (ou desfeita): o rascunho acompanha.
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }
  const isDirty = draft.trim() !== value.trim();

  function apply() {
    if (isDirty) onChange(draft.trim());
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      apply();
    }
  }

  return (
    <FormField
      label="JQL a mais (opcional)"
      htmlFor={id}
      hint={
        <>
          Somada com AND aos campos acima, sem <code>ORDER BY</code>. Ex.: <code>labels = backend</code>.
        </>
      }
    >
      <textarea
        id={id}
        className="input"
        rows={2}
        spellCheck={false}
        placeholder='component = "API"'
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={apply}
        onKeyDown={handleKeyDown}
      />
      {isDirty && (
        <Button variant="secondary" className={styles.apply} onClick={apply}>
          Aplicar JQL
        </Button>
      )}
    </FormField>
  );
}
