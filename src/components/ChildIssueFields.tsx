import { useId } from 'react';
import type { CreateField, CreateFieldOption, IssueTypeOption } from '../api/jira-issues';
import { activityOptions, type ChildDraft, type DraftErrors, findActivityFields } from '../lib/subtaskDraft';
import styles from './ChildIssueFields.module.css';
import { FormField } from './FormField';
import { SingleSelect } from './SingleSelect';
import { UserPicker } from './UserPicker';

interface ChildIssueFieldsProps {
  projectKey: string;
  draft: ChildDraft;
  onChange: (patch: Partial<ChildDraft>) => void;
  /** Tipos que dá para criar neste nível (o seletor só aparece com mais de um). */
  types: IssueTypeOption[];
  /** Campos da tela de criação do tipo escolhido; `undefined` enquanto carregam. */
  fields: CreateField[] | undefined;
  errors?: DraftErrors;
  disabled?: boolean;
  autoFocus?: boolean;
  /** "subtarefa" ou "issue", para os textos de exemplo. */
  noun: string;
}

interface ChoiceOption {
  value: string;
  label: string;
}

const toChoice = (option: CreateFieldOption): ChoiceOption => ({ value: option.id, label: option.value });

/** O erro do campo no lugar da dica (ou nada). */
function errorHint(message: string | undefined) {
  return message ? (
    <span className={styles.error} role="alert">
      {message}
    </span>
  ) : undefined;
}

/**
 * Os campos de uma filha nova: título, descrição, relator, responsável,
 * estimativa, tipo de atividade e atividade. Os dois últimos (e as opções deles)
 * vêm da tela de criação do projeto no Jira: só aparecem se ela os tiver.
 */
export function ChildIssueFields({ projectKey, draft, onChange, types, fields, errors = {}, disabled, autoFocus, noun }: ChildIssueFieldsProps) {
  const id = useId();
  const activity = findActivityFields(fields);
  const activityList = activityOptions(activity, draft.activityTypeId);
  const typeOptions = activity.type?.options.map(toChoice) ?? [];
  const activityChoices = activityList.map(toChoice);
  const activityName = activity.activity?.name ?? 'Atividade';
  const showActivity = Boolean(activity.activity) || activity.activityFromType;

  return (
    <div className={styles.fields}>
      <FormField label="Título" htmlFor={`${id}-summary`} hint={errorHint(errors.summary)}>
        <input
          id={`${id}-summary`}
          className="input"
          value={draft.summary}
          maxLength={255}
          onChange={(event) => onChange({ summary: event.target.value })}
          placeholder={`O que a ${noun} precisa fazer`}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-invalid={Boolean(errors.summary) || undefined}
        />
      </FormField>

      <FormField label="Descrição" htmlFor={`${id}-description`} hint={errorHint(errors.description)}>
        <textarea
          id={`${id}-description`}
          className={`input ${styles.description}`}
          rows={3}
          value={draft.description}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder="O que fazer e como saber que ficou pronto"
          disabled={disabled}
        />
      </FormField>

      <div className={styles.row}>
        {types.length > 1 && (
          <FormField label="Tipo" htmlFor={`${id}-type`}>
            <select
              id={`${id}-type`}
              className="input"
              value={draft.issueTypeId}
              // Outro tipo tem outra tela de criação: as opções de atividade recomeçam.
              onChange={(event) => onChange({ issueTypeId: event.target.value, activityTypeId: '', activityId: '' })}
              disabled={disabled}
            >
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <FormField label="Relator" htmlFor={`${id}-reporter`} hint={errorHint(errors.reporter)}>
          <UserPicker
            inputId={`${id}-reporter`}
            source={{ kind: 'any' }}
            value={draft.reporter}
            onChange={(reporter) => onChange({ reporter })}
            isDisabled={disabled}
          />
        </FormField>
        <FormField label="Responsável" htmlFor={`${id}-assignee`}>
          <UserPicker
            inputId={`${id}-assignee`}
            source={{ kind: 'assignable', projectKey }}
            value={draft.assignee}
            onChange={(assignee) => onChange({ assignee })}
            allowNone
            isDisabled={disabled}
          />
        </FormField>
      </div>

      <div className={styles.row}>
        <FormField
          label="Estimativa"
          htmlFor={`${id}-estimate`}
          hint={errorHint(errors.estimate) ?? 'Ex: 3h 43m'}
        >
          <input
            id={`${id}-estimate`}
            className="input"
            value={draft.estimate}
            onChange={(event) => onChange({ estimate: event.target.value })}
            placeholder="3h 43m"
            inputMode="text"
            spellCheck={false}
            disabled={disabled}
            aria-invalid={Boolean(errors.estimate) || undefined}
          />
        </FormField>

        {activity.type && (
          <FormField label={activity.type.name} htmlFor={`${id}-activity-type`} hint={errorHint(errors.activityType)}>
            {activity.type.kind === 'text' ? (
              <input
                id={`${id}-activity-type`}
                className="input"
                value={draft.activityTypeId}
                onChange={(event) => onChange({ activityTypeId: event.target.value })}
                disabled={disabled}
              />
            ) : (
              <SingleSelect<ChoiceOption>
                inputId={`${id}-activity-type`}
                placeholder="Escolha"
                options={typeOptions}
                value={typeOptions.find((option) => option.value === draft.activityTypeId) ?? null}
                // Em cascata, as atividades mudam com o tipo.
                onChange={(option) =>
                  onChange({ activityTypeId: option?.value ?? '', ...(activity.activityFromType && { activityId: '' }) })
                }
                isClearable={!activity.type.required}
                isDisabled={disabled}
                menuPlacement="auto"
              />
            )}
          </FormField>
        )}

        {showActivity && (
          <FormField label={activityName} htmlFor={`${id}-activity`} hint={errorHint(errors.activity)}>
            {activity.activity?.kind === 'text' ? (
              <input
                id={`${id}-activity`}
                className="input"
                value={draft.activityId}
                onChange={(event) => onChange({ activityId: event.target.value })}
                disabled={disabled}
              />
            ) : (
              <SingleSelect<ChoiceOption>
                inputId={`${id}-activity`}
                placeholder={activity.activityFromType && !draft.activityTypeId ? `Escolha o ${activity.type!.name.toLowerCase()} antes` : 'Escolha'}
                options={activityChoices}
                value={activityChoices.find((option) => option.value === draft.activityId) ?? null}
                onChange={(option) => onChange({ activityId: option?.value ?? '' })}
                isClearable={!activity.activity?.required}
                isDisabled={disabled || (activity.activityFromType && !draft.activityTypeId)}
                menuPlacement="auto"
              />
            )}
          </FormField>
        )}
      </div>

      {fields && !activity.type && !activity.activity && (
        <p className={styles.note}>
          A tela de criação deste tipo no projeto {projectKey} não tem os campos "Tipo de atividade" e "Atividade".
        </p>
      )}
    </div>
  );
}
