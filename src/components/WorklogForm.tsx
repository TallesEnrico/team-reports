import { WarningCircle } from '@phosphor-icons/react';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import type { WorklogInput } from '@/api/jira-worklogs';
import { formatDuration, type TimeFormat } from '@/lib/formatDuration';
import { cx } from '@/lib/cx';
import { reportTimeZoneLabel, type ReportTimeZone } from '@/lib/timeZones';
import {
  checkSpentDuration,
  currentTimeValue,
  endTimeAfter,
  formatSpentDuration,
  formDurationSeconds,
  parseSpentDuration,
  type WorklogFormResult,
  type WorklogFormValues,
} from '@/lib/worklogForm';
import { useLogWorkSettingsStore, type WorklogFillMode } from '@/store/useLogWorkSettingsStore';
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
  withFillMode?: boolean;
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
  withFillMode = false,
}: WorklogFormProps) {
  const storedFillMode = useLogWorkSettingsStore((state) => state.fillMode);
  const setFillMode = useLogWorkSettingsStore((state) => state.setFillMode);
  const fillMode: WorklogFillMode = withFillMode ? storedFillMode : 'end';
  const fillByDuration = fillMode === 'duration';
  const [values, setValues] = useState(() => {
    if (!withFillMode || useLogWorkSettingsStore.getState().fillMode !== 'duration' || initialValues.start) {
      return initialValues;
    }
    return { ...initialValues, start: currentTimeValue(timeZone) };
  });
  const [durationText, setDurationText] = useState(() => {
    const seconds = formDurationSeconds(initialValues);
    return seconds !== null && seconds > 0 ? formatSpentDuration(seconds) : '';
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const dateId = useId();
  const startId = useId();
  const endId = useId();
  const durationId = useId();
  const commentId = useId();

  const duration = formDurationSeconds(values);
  const error = validationError ?? saveError;

  function commit(next: WorklogFormValues, nextError: string | null = null) {
    setValues(next);
    setValidationError(nextError);
    onValuesChange?.(next);
  }

  function setField(field: keyof WorklogFormValues, value: string) {
    commit({ ...values, [field]: value });
  }

  function syncDuration(text: string, start: string) {
    setDurationText(text);
    const trimmed = text.trim();
    if (!trimmed) {
      commit({ ...values, start, end: '' });
      return;
    }
    const seconds = parseSpentDuration(trimmed);
    if (seconds === null) {
      if (start !== values.start) commit({ ...values, start });
      else setValidationError(null);
      return;
    }
    if (seconds <= 0) {
      commit({ ...values, start, end: '' }, 'Informe uma duração maior que zero, ex: 2h 30m ou 29m.');
      return;
    }
    const end = endTimeAfter(start, seconds);
    if (!end) {
      commit(
        { ...values, start, end: '' },
        start ? 'A duração passa da meia-noite. Ajuste o início ou a duração.' : null,
      );
      return;
    }
    commit({ ...values, start, end });
  }

  function selectFillMode(mode: WorklogFillMode) {
    if (mode === fillMode) return;
    setFillMode(mode);
    if (mode === 'end') {
      const seconds = parseSpentDuration(durationText);
      if (seconds !== null && seconds > 0) {
        const end = endTimeAfter(values.start, seconds);
        if (end) commit({ ...values, end });
      }
      return;
    }
    const start = values.start || currentTimeValue(timeZone);
    const fromTimes = formDurationSeconds(values);
    const text = fromTimes !== null && fromTimes > 0 ? formatSpentDuration(fromTimes) : durationText;
    syncDuration(text, start);
  }

  function blurDuration() {
    const checked = checkSpentDuration(durationText);
    if (!checked) return;
    if ('error' in checked) {
      commit({ ...values, end: '' }, checked.error);
      return;
    }
    syncDuration(checked.text, values.start);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    let next = values;
    if (fillByDuration) {
      const checked = checkSpentDuration(durationText);
      if (!checked || 'error' in checked) {
        setValidationError(checked && 'error' in checked ? checked.error : 'Informe a duração, ex: 2h 30m ou 29m.');
        return;
      }
      const { seconds } = checked;
      const end = endTimeAfter(values.start, seconds);
      if (!end) {
        setValidationError(
          values.start ? 'A duração passa da meia-noite. Ajuste o início ou a duração.' : 'Informe a hora de início.',
        );
        return;
      }
      next = { ...values, end };
    }
    const result = validate(next);
    if ('error' in result) setValidationError(result.error);
    else onSubmit(result.input);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <fieldset className={styles.fieldset} disabled={isSaving}>
        <div className={cx(styles.timeRow, fillByDuration && styles.timeRowDuration)}>
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
          {fillByDuration && (
            <FormField label="Duração" htmlFor={durationId}>
              <input
                id={durationId}
                className={`input ${styles.durationInput}`}
                data-worklog-duration=""
                value={durationText}
                placeholder="2h 30m"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoFocus={autoFocusField === 'start'}
                onChange={(event) => syncDuration(event.target.value, values.start)}
                onBlur={blurDuration}
              />
            </FormField>
          )}
          <FormField label="Início" htmlFor={startId}>
            <input
              id={startId}
              autoFocus={autoFocusField === 'start' && !fillByDuration}
              className="input"
              type="time"
              required
              value={values.start}
              onChange={(event) =>
                fillByDuration ? syncDuration(durationText, event.target.value) : setField('start', event.target.value)
              }
            />
          </FormField>
          {!fillByDuration && (
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
          )}
          {!fillByDuration && (
            <div className={styles.duration}>
              <span className={styles.durationLabel}>Duração</span>
              <span className={styles.durationValue}>
                {duration !== null && duration > 0 ? formatDuration(duration, timeFormat) : '—'}
              </span>
            </div>
          )}
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

      <div className={styles.footer}>
        <div className={styles.options}>
          <label className={styles.closeOnSuccess}>
            <input type="checkbox" checked={closeOnSuccess} onChange={(event) => setCloseOnSuccess(event.target.checked)} />
            Fechar janela ao concluir
          </label>
          {withFillMode && (
            <div className={styles.fillMode} role="group" aria-label="Como informar o horário">
              <button
                type="button"
                aria-pressed={fillByDuration}
                disabled={isSaving}
                onClick={() => selectFillMode('duration')}
              >
                Preencher duração
              </button>
              <button type="button" aria-pressed={!fillByDuration} disabled={isSaving} onClick={() => selectFillMode('end')}>
                Preencher fim
              </button>
            </div>
          )}
        </div>

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
