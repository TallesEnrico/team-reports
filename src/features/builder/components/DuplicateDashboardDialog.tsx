import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../../components/Button';
import { FormField } from '../../../components/FormField';
import { Modal } from '../../../components/Modal';
import { useBuilderStore } from '../store/useBuilderStore';
import type { Dashboard } from '../types';
import styles from './DuplicateDashboardDialog.module.css';

/** Nome sugerido para a cópia: "<nome> (cópia)", ou "(cópia 2)", "(cópia 3)"… se já existir. */
function suggestCopyName(name: string, dashboards: Dashboard[]): string {
  const taken = new Set(dashboards.map((dashboard) => dashboard.name));
  const base = `${name} (cópia)`.slice(0, 60);
  if (!taken.has(base)) return base;
  for (let index = 2; ; index++) {
    const candidate = `${name} (cópia ${index})`.slice(0, 60);
    if (!taken.has(candidate)) return candidate;
  }
}

/** Confirmação antes de duplicar um dashboard, com o nome da cópia para editar. */
export function DuplicateDashboardDialog({ dashboard, onClose }: { dashboard: Dashboard; onClose: () => void }) {
  const titleId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dashboards = useBuilderStore((state) => state.dashboards);
  const duplicateDashboard = useBuilderStore((state) => state.duplicateDashboard);
  const [name, setName] = useState(() => suggestCopyName(dashboard.name, dashboards));
  const trimmed = name.trim();
  const isTaken = dashboards.some((other) => other.name === trimmed);

  // O nome sugerido já vem selecionado: digitar troca, Enter confirma.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed || isTaken) return;
    duplicateDashboard(dashboard.id, trimmed);
    onClose();
  }

  return (
    <Modal
      labelledBy={titleId}
      onClose={onClose}
      header={
        <h2 id={titleId} className={styles.title}>
          Duplicar "{dashboard.name}"?
        </h2>
      }
    >
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <p className={styles.text}>
          A cópia leva as mesmas peças, ligações e período, e abre em seguida. O original não muda.
        </p>
        <FormField
          label="Nome da cópia"
          htmlFor={inputId}
          hint={
            isTaken ? (
              <span className={styles.error} role="alert">
                Já existe um dashboard com esse nome. Escolha outro.
              </span>
            ) : undefined
          }
        >
          <input
            ref={inputRef}
            id={inputId}
            className="input"
            value={name}
            maxLength={60}
            aria-invalid={!trimmed || isTaken || undefined}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!trimmed || isTaken}>
            Duplicar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
