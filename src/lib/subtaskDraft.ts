import type { CreateField, CreateFieldOption, NewChildIssue } from '../api/jira-issues';
import type { JiraUser } from '../api/jira-users';

/** Uma filha em edição (o formulário manual e cada sugestão da IA). */
export interface ChildDraft {
  issueTypeId: string;
  summary: string;
  description: string;
  reporter: JiraUser | null;
  assignee: JiraUser | null;
  /** Estimativa original como a pessoa digitou ("3h 43m"). */
  estimate: string;
  /** Opção de "Tipo de atividade" (id do Jira). */
  activityTypeId: string;
  /** Opção de "Atividade" (id do Jira). */
  activityId: string;
}

export function emptyDraft(defaults: Partial<ChildDraft> = {}): ChildDraft {
  return {
    issueTypeId: '',
    summary: '',
    description: '',
    reporter: null,
    assignee: null,
    estimate: '',
    activityTypeId: '',
    activityId: '',
    ...defaults,
  };
}

/** Sem acento e sem diferenciar maiúsculas (para achar campos e opções pelo nome). */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Os nomes dos campos de atividade no Jira (comparados sem acento e sem
 * maiúsculas). O id do campo personalizado muda de site para site, por isso
 * eles são achados pelo nome na tela de criação.
 */
const ACTIVITY_TYPE_NAMES = ['tipo de atividade', 'tipo atividade'];
const ACTIVITY_NAMES = ['atividade', 'atividades'];

export interface ActivityFields {
  /** "Tipo de atividade". */
  type?: CreateField;
  /** "Atividade" (um campo à parte). */
  activity?: CreateField;
  /** Sem "Atividade" à parte e "Tipo de atividade" em cascata: as atividades são as sub-opções do tipo. */
  activityFromType: boolean;
}

const isChoice = (field: CreateField) => field.kind !== 'other' && (field.options.length > 0 || field.kind === 'text');

/** Os campos de atividade da tela de criação (cada um, se existir). */
export function findActivityFields(fields: CreateField[] | undefined): ActivityFields {
  const byName = (names: string[]) =>
    fields?.find((field) => names.includes(normalizeName(field.name)) && isChoice(field));
  const type = byName(ACTIVITY_TYPE_NAMES);
  const activity = byName(ACTIVITY_NAMES);
  return { type, activity, activityFromType: !activity && type?.kind === 'cascading' };
}

/** As opções de "Atividade": as do campo próprio, ou as sub-opções do tipo escolhido (cascata). */
export function activityOptions(fields: ActivityFields, activityTypeId: string): CreateFieldOption[] {
  if (fields.activity) {
    // Atividade em cascata (raro): as opções de primeiro nível.
    return fields.activity.options;
  }
  if (fields.activityFromType) return fields.type?.options.find((option) => option.id === activityTypeId)?.children ?? [];
  return [];
}

/** "3h 43m", "1d 2h", "45m", "2.5h": o formato de tempo do Jira. */
const ESTIMATE_PATTERN = /^(\d+(?:[.,]\d+)?\s*[wdhm]\s*)+$/i;

/** A estimativa no formato do Jira ("3h43m" → "3h 43m"); `null` se não for um tempo. */
export function normalizeEstimate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!ESTIMATE_PATTERN.test(trimmed)) return null;
  return (trimmed.match(/\d+(?:[.,]\d+)?\s*[wdhm]/gi) ?? [])
    .map((part) => part.replace(/\s+/g, '').replace(',', '.').toLowerCase())
    .join(' ');
}

/** O valor de um campo de escolha no formato que o Jira pede na criação. */
function choiceValue(field: CreateField, optionId: string, childId?: string): unknown {
  switch (field.kind) {
    case 'options':
      return [{ id: optionId }];
    case 'cascading':
      return childId ? { id: optionId, child: { id: childId } } : { id: optionId };
    case 'text':
      return field.options.find((option) => option.id === optionId)?.value ?? optionId;
    default:
      return { id: optionId };
  }
}

export type DraftErrors = Partial<Record<'summary' | 'estimate' | 'activityType' | 'activity' | 'description' | 'reporter', string>>;

/** O que falta ou está errado no rascunho (os obrigatórios vêm da tela de criação do Jira). */
export function validateDraft(draft: ChildDraft, fields: CreateField[] | undefined): DraftErrors {
  const errors: DraftErrors = {};
  const required = (fieldId: string) => fields?.some((field) => field.fieldId === fieldId && field.required) ?? false;
  const activity = findActivityFields(fields);
  if (!draft.summary.trim()) errors.summary = 'Escreva o título.';
  if (normalizeEstimate(draft.estimate) === null) errors.estimate = 'Use o formato do Jira, ex: 3h 43m, 1d 2h ou 45m.';
  else if (!draft.estimate.trim() && required('timetracking')) errors.estimate = 'O Jira pede a estimativa neste projeto.';
  if (!draft.description.trim() && required('description')) errors.description = 'O Jira pede a descrição neste projeto.';
  if (!draft.reporter && required('reporter')) errors.reporter = 'O Jira pede o relator neste projeto.';
  if (activity.type?.required && !draft.activityTypeId) errors.activityType = `Escolha o ${activity.type.name.toLowerCase()}.`;
  const activityRequired = activity.activity?.required || (activity.activityFromType && activity.type?.required);
  if (activityRequired && !draft.activityId && activityOptions(activity, draft.activityTypeId).length > 0) {
    errors.activity = 'Escolha a atividade.';
  }
  return errors;
}

/**
 * O rascunho no formato da criação (`createChildIssue`). O relator só vai quando
 * não é quem cria (`currentAccountId`), que já é o padrão do Jira: escolher o
 * relator pede a permissão "Modificar relator".
 */
export function draftToNewIssue(draft: ChildDraft, fields: CreateField[] | undefined, currentAccountId?: string): NewChildIssue {
  const activity = findActivityFields(fields);
  const customFields: Record<string, unknown> = {};
  if (activity.type && draft.activityTypeId) {
    customFields[activity.type.fieldId] = choiceValue(
      activity.type,
      draft.activityTypeId,
      activity.activityFromType ? draft.activityId || undefined : undefined,
    );
  }
  if (activity.activity && draft.activityId) {
    customFields[activity.activity.fieldId] = choiceValue(activity.activity, draft.activityId);
  }
  return {
    summary: draft.summary.trim().replace(/\s+/g, ' '),
    issueTypeId: draft.issueTypeId,
    description: draft.description,
    reporter: draft.reporter && draft.reporter.accountId !== currentAccountId ? draft.reporter : null,
    assignee: draft.assignee,
    estimate: normalizeEstimate(draft.estimate) ?? '',
    customFields,
    createScreen: fields ? new Set(fields.map((field) => field.fieldId)) : undefined,
  };
}
