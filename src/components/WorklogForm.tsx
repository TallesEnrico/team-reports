import { WarningCircle } from '@phosphor-icons/react';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import type { WorklogInput } from '../api/jira-worklogs';
import { formatDuration, type TimeFormat } from '../lib/formatDuration';
import { reportTimeZoneLabel, type ReportTimeZone } from '../lib/timeZones';
import { formDurationSeconds, type WorklogFormResult, type WorklogFormValues } from '../lib/worklogForm';
import { Button } from './Button';
import { FormField } from './FormField';
import styles from './WorklogForm.module.css';

interface WorklogFormProps {
  initialValues: WorklogFormValues;
  /** Valida os campos e monta o pedido ao Jira (edição ou lançamento novo). */
  validate: (values: WorklogFormValues) => WorklogFormResult;
  timeZone: ReportTimeZone;
  timeFormat: TimeFormat;
  submitLabel: string;
  /** Dica abaixo da descrição (ex: na edição, que a formatação original vira texto). */
  commentHint?: string;
  isSaving: boolean;
  /** Impede o envio sem trocar o rótulo (ex.: a tarefa ainda está carregando). */
  isSubmitDisabled?: boolean;
  /** Erro devolvido pelo Jira ao salvar. */
  saveError: string | null;
  /** `null` quando nada mudou. */
  onSubmit: (input: WorklogInput | null) => void;
  onCancel: () => void;
  /** Campo com o foco ao abrir (padrão: a data; ex: o início, para lançar outro horário no mesmo dia). */
  autoFocusField?: 'date' | 'start';
  /** Abaixo dos horários, com os valores enquanto são digitados (ex: a linha do tempo do dia). */
  renderAfterTimes?: (values: WorklogFormValues) => ReactNode;
  /** A cada campo alterado, com os valores novos (ex: o "Com este" do controle de tempo, fora do formulário). */
  onValuesChange?: (values: WorklogFormValues) => void;
  closeOnSuccess: boolean;
  setCloseOnSuccess: (closeOnSuccess: boolean) => void;
}

/** Data, início, fim e descrição de um apontamento: editar um existente ou lançar um novo. */
export function WorklogForm({
  initialValues,
  validate,
  timeZone,
  timeFormat,
  submitLabel,
  commentHint,
  isSaving,
  isSubmitDisabled = false,
  saveError,
  onSubmit,
  onCancel,
  autoFocusField = 'date',
  renderAfterTimes,
  onValuesChange,
  closeOnSuccess,
  setCloseOnSuccess,
}: WorklogFormProps) {
  const [values, setValues] = useState(initialValues);
  const [validationError, setValidationError] = useState<string | null>(null);
  const dateId = useId();
  const startId = useId();
  const endId = useId();
  const commentId = useId();

  const duration = formDurationSeconds(values);
  const error = validationError ?? saveError;

  function setField(field: keyof typeof values, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    setValidationError(null);
    onValuesChange?.(next);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validate(values);
    if ('error' in result) setValidationError(result.error);
    else onSubmit(result.input);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <fieldset className={styles.fieldset} disabled={isSaving}>
        <div className={styles.timeRow}>
          <FormField label="Data" htmlFor={dateId}>
            <input
              id={dateId}
              className="input"
              type="date"
              required
              autoFocus={autoFocusField === 'date'}
              value={values.date}
              onChange={(event) => setField('date', event.target.value)}
            />
          </FormField>
          <FormField label="Início" htmlFor={startId}>
            <input
              id={startId}
              autoFocus={autoFocusField === 'start'}
              className="input"
              type="time"
              required
              value={values.start}
              onChange={(event) => setField('start', event.target.value)}
            />
          </FormField>
          <FormField label="Fim" htmlFor={endId}>
            <input
              id={endId}
              className="input"
              type="time"
              required
              value={values.end}
              onChange={(event) => setField('end', event.target.value)}
            />
          </FormField>
          <div className={styles.duration}>
            <span className={styles.durationLabel}>Duração</span>
            <span className={styles.durationValue}>
              {duration !== null && duration > 0 ? formatDuration(duration, timeFormat) : '—'}
            </span>
          </div>
        </div>
        <p className={styles.hint}>Horários no fuso {reportTimeZoneLabel(timeZone)}.</p>
        {renderAfterTimes?.(values)}

        <FormField label="Descrição" htmlFor={commentId} hint={commentHint}>
          <textarea
            id={commentId}
            className={`input ${styles.comment}`}
            rows={4}
            value={values.comment}
            onChange={(event) => setField('comment', event.target.value)}
          />
        </FormField>
      </fieldset>

      {error && (
        <p role="alert" className={styles.error}>
          <WarningCircle size={16} weight="bold" aria-hidden />
          {error}
        </p>
      )}

      <div className="flex flex-row justify-between">
        <label className={styles.closeOnSuccess}>
          <input type="checkbox" checked={closeOnSuccess} onChange={(event) => setCloseOnSuccess(event.target.checked)} />
          Fechar janela ao concluir
        </label>

        <div className={styles.actions}>
          <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" disabled={isSaving || isSubmitDisabled}>
            {isSaving ? 'Salvando…' : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
