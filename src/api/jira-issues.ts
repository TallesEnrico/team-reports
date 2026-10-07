import { requestJira } from './jira-client';
import { searchIssues } from './jira-search';
import { type JiraUser, type RawJiraUser, toJiraUser } from './jira-users';
import { fetchIssueWorklogs, toWorklogEntry, type WorklogEntry } from './jira-worklogs';
import { type AdfNode, adfToPlainText, plainTextToAdf } from '../lib/adf';

// Issue no formato usado pelo modal da issue (Kanban e Reports) e pelos cards do quadro.

export interface IssueStatus {
  id: string;
  name: string;
  /** 'new' (a fazer), 'indeterminate' (em andamento) ou 'done' (concluído). */
  categoryKey?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  status: IssueStatus;
  issueType: {
    id: string;
    name: string;
    iconUrl?: string;
    /** Nível na hierarquia do Jira: -1 subtarefa, 0 história/tarefa/bug, 1 épico. */
    hierarchyLevel: number;
  };
  priority?: { id: string; name: string; iconUrl?: string };
  assignee?: JiraUser;
  parent?: { id: string; key: string; summary: string; iconUrl?: string; status?: IssueStatus };
  timeSpentSeconds: number;
  originalEstimateSeconds?: number;
  remainingEstimateSeconds?: number;
  /** Somas do Jira: a issue e as subtarefas dela (numa subtarefa, o mesmo que o dela). */
  aggregateTimeSpentSeconds?: number;
  aggregateOriginalEstimateSeconds?: number;
  aggregateRemainingEstimateSeconds?: number;
}

/** Lançado, estimativa original e restante (os dois últimos, só quando há). */
export interface TimeTotals {
  spentSeconds: number;
  originalEstimateSeconds?: number;
  remainingEstimateSeconds?: number;
}

export interface IssueTransition {
  id: string;
  name: string;
  to: IssueStatus;
}

export interface IssueDetails extends JiraIssue {
  /** Descrição em texto simples (ADF convertido). */
  description: string;
  reporter?: JiraUser;
  created: string;
  updated: string;
  dueDate?: string;
  labels: string[];
}

/** Apontamento com quem lançou, para a lista do modal. */
export interface IssueWorklog extends WorklogEntry {
  author: string;
  avatarUrl?: string;
}

// ---------- Formatos crus (REST v3) ----------

interface RawStatus {
  id: string;
  name: string;
  statusCategory?: { key?: string };
}

export interface RawIssueFields {
  summary?: string;
  status?: RawStatus;
  issuetype?: { id: string; name: string; iconUrl?: string; subtask?: boolean; hierarchyLevel?: number };
  priority?: { id: string; name: string; iconUrl?: string } | null;
  assignee?: RawJiraUser | null;
  parent?: { id: string; key: string; fields?: { summary?: string; issuetype?: { iconUrl?: string }; status?: RawStatus } };
  timespent?: number | null;
  timeoriginalestimate?: number | null;
  timeestimate?: number | null;
  aggregatetimespent?: number | null;
  aggregatetimeoriginalestimate?: number | null;
  aggregatetimeestimate?: number | null;
}

interface RawDetailsFields extends RawIssueFields {
  description?: AdfNode | null;
  reporter?: RawJiraUser | null;
  created: string;
  updated: string;
  duedate?: string | null;
  labels?: string[];
}

export interface RawIssue<Fields> {
  id: string;
  key: string;
  fields: Fields;
}

/** Campos de `JiraIssue` (o que o card e o cabeçalho do modal mostram). */
export const ISSUE_FIELDS = [
  'summary',
  'status',
  'issuetype',
  'priority',
  'assignee',
  'parent',
  'timespent',
  'timeoriginalestimate',
  'timeestimate',
  'aggregatetimespent',
  'aggregatetimeoriginalestimate',
  'aggregatetimeestimate',
];
const DETAILS_FIELDS = [...ISSUE_FIELDS, 'description', 'reporter', 'created', 'updated', 'duedate', 'labels'];

function toStatus(raw: RawStatus | undefined): IssueStatus {
  return raw ? { id: raw.id, name: raw.name, categoryKey: raw.statusCategory?.key } : { id: '', name: '' };
}

function optionalSeconds(value: number | null | undefined): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

export function toJiraIssue(raw: RawIssue<RawIssueFields>): JiraIssue {
  const { fields } = raw;
  return {
    id: raw.id,
    key: raw.key,
    summary: fields.summary ?? '',
    status: toStatus(fields.status),
    issueType: fields.issuetype
      ? {
          id: fields.issuetype.id,
          name: fields.issuetype.name,
          iconUrl: fields.issuetype.iconUrl,
          hierarchyLevel: fields.issuetype.hierarchyLevel ?? (fields.issuetype.subtask ? -1 : 0),
        }
      : { id: '', name: '', hierarchyLevel: 0 },
    priority: fields.priority ? { ...fields.priority } : undefined,
    assignee: fields.assignee ? toJiraUser(fields.assignee) : undefined,
    parent: fields.parent
      ? {
          id: fields.parent.id,
          key: fields.parent.key,
          summary: fields.parent.fields?.summary ?? '',
          iconUrl: fields.parent.fields?.issuetype?.iconUrl,
          status: fields.parent.fields?.status ? toStatus(fields.parent.fields.status) : undefined,
        }
      : undefined,
    timeSpentSeconds: fields.timespent ?? 0,
    originalEstimateSeconds: optionalSeconds(fields.timeoriginalestimate),
    remainingEstimateSeconds: optionalSeconds(fields.timeestimate),
    aggregateTimeSpentSeconds: optionalSeconds(fields.aggregatetimespent),
    aggregateOriginalEstimateSeconds: optionalSeconds(fields.aggregatetimeoriginalestimate),
    aggregateRemainingEstimateSeconds: optionalSeconds(fields.aggregatetimeestimate),
  };
}

/** Só os campos de `JiraIssue` (ex: dos detalhes, para trocar o card nas listas em cache). */
export function toBaseIssue(issue: JiraIssue): JiraIssue {
  return {
    id: issue.id,
    key: issue.key,
    summary: issue.summary,
    status: issue.status,
    issueType: issue.issueType,
    priority: issue.priority,
    assignee: issue.assignee,
    parent: issue.parent,
    timeSpentSeconds: issue.timeSpentSeconds,
    originalEstimateSeconds: issue.originalEstimateSeconds,
    remainingEstimateSeconds: issue.remainingEstimateSeconds,
    aggregateTimeSpentSeconds: issue.aggregateTimeSpentSeconds,
    aggregateOriginalEstimateSeconds: issue.aggregateOriginalEstimateSeconds,
    aggregateRemainingEstimateSeconds: issue.aggregateRemainingEstimateSeconds,
  };
}

/** Tempo da própria issue (sem as filhas). */
export function ownTimeTotals(issue: JiraIssue): TimeTotals {
  return {
    spentSeconds: issue.timeSpentSeconds,
    originalEstimateSeconds: issue.originalEstimateSeconds,
    remainingEstimateSeconds: issue.remainingEstimateSeconds,
  };
}

/**
 * Tempo de uma issue pai: a soma das filhas. Cada filha entra com a soma do
 * Jira (ela e as subtarefas dela), então um épico soma também as subtarefas das
 * histórias. Estimativa e restante só aparecem se alguma filha tiver.
 */
export function sumChildrenTime(children: JiraIssue[]): TimeTotals {
  const totals: TimeTotals = { spentSeconds: 0 };
  for (const child of children) {
    totals.spentSeconds += child.aggregateTimeSpentSeconds ?? child.timeSpentSeconds;
    const original = child.aggregateOriginalEstimateSeconds ?? child.originalEstimateSeconds;
    if (original !== undefined) totals.originalEstimateSeconds = (totals.originalEstimateSeconds ?? 0) + original;
    const remaining = child.aggregateRemainingEstimateSeconds ?? child.remainingEstimateSeconds;
    if (remaining !== undefined) totals.remainingEstimateSeconds = (totals.remainingEstimateSeconds ?? 0) + remaining;
  }
  return totals;
}

/** Chave do projeto de uma issue (CLI-5151 → CLI). */
export function projectKeyOf(issueKey: string): string {
  return issueKey.slice(0, issueKey.lastIndexOf('-'));
}

const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-\d+$/;

/** Chave de issue do Jira (ex: CLI-5151); vale para o que vem do endereço ou da pesquisa antes de ir para a API. */
export function isIssueKey(value: string | null | undefined): value is string {
  return typeof value === 'string' && ISSUE_KEY.test(value);
}

// ---------- Leitura ----------

/**
 * Uma issue pelo id ou pela chave (para atualizar as listas em cache depois de
 * uma escrita, ou abrir o modal de uma issue que a tela não tem).
 */
export async function fetchIssue(issueIdOrKey: string, signal?: AbortSignal): Promise<JiraIssue> {
  const raw = await requestJira<RawIssue<RawIssueFields>>(`rest/api/3/issue/${issueIdOrKey}`, {
    params: { fields: ISSUE_FIELDS.join(',') },
    signal,
  });
  return toJiraIssue(raw);
}

const CHILDREN_LIMIT = 200;

/**
 * Filhas de uma issue (`parent = CHAVE`): as subtarefas de uma história, ou as
 * issues de um épico. Todas, de qualquer pessoa.
 */
export async function fetchChildIssues(issueKey: string, signal?: AbortSignal): Promise<JiraIssue[]> {
  if (!isIssueKey(issueKey)) return [];
  const result = await searchIssues<RawIssueFields>(`parent = ${issueKey} ORDER BY Rank ASC`, ISSUE_FIELDS, {
    signal,
    limit: CHILDREN_LIMIT,
  });
  return result.issues.map(toJiraIssue);
}

export async function fetchIssueDetails(issueKey: string, signal?: AbortSignal): Promise<IssueDetails> {
  const raw = await requestJira<RawIssue<RawDetailsFields>>(`rest/api/3/issue/${issueKey}`, {
    params: { fields: DETAILS_FIELDS.join(',') },
    signal,
  });
  const { fields } = raw;
  return {
    ...toJiraIssue(raw),
    description: fields.description ? adfToPlainText(fields.description) : '',
    reporter: fields.reporter ? toJiraUser(fields.reporter) : undefined,
    created: fields.created,
    updated: fields.updated,
    dueDate: fields.duedate ?? undefined,
    labels: fields.labels ?? [],
  };
}

/** Apontamentos da issue, do mais recente para o mais antigo. */
export async function fetchIssueWorklogList(issueId: string, signal?: AbortSignal): Promise<IssueWorklog[]> {
  const raws = await fetchIssueWorklogs(issueId, {}, signal);
  return raws
    .map((raw) => {
      const author = raw.author ? toJiraUser(raw.author) : undefined;
      return {
        ...toWorklogEntry(raw),
        author: author?.displayName ?? 'Usuário desconhecido',
        avatarUrl: author?.avatarUrl,
      };
    })
    .sort((a, b) => Date.parse(b.started) - Date.parse(a.started));
}

// ---------- Status ----------

/** Transições que a conta pode fazer agora na issue. */
export async function fetchTransitions(issueId: string, signal?: AbortSignal): Promise<IssueTransition[]> {
  const data = await requestJira<{ transitions: (IssueTransition & { to: RawStatus; isAvailable?: boolean })[] }>(
    `rest/api/3/issue/${issueId}/transitions`,
    { signal },
  );
  return data.transitions
    .filter((transition) => transition.isAvailable !== false)
    .map((transition) => ({ id: transition.id, name: transition.name, to: toStatus(transition.to) }));
}

/** Muda o status da issue (escopo `write:jira-work`). */
export async function transitionIssue(issueId: string, transitionId: string): Promise<void> {
  await requestJira<void>(`rest/api/3/issue/${issueId}/transitions`, {
    method: 'POST',
    data: { transition: { id: transitionId } },
  });
}

// ---------- Edição ----------

/** Campos editáveis no modal da issue; só vai ao Jira o que mudou. */
export interface IssueChanges {
  summary?: string;
  /** Texto simples: vira um parágrafo por linha (a formatação original se perde, por isso só vai quando muda). */
  description?: string;
  /** `null` = sem responsável. */
  assignee?: JiraUser | null;
  reporter?: JiraUser;
}

/**
 * Edita a issue (escopo `write:jira-work`). Tudo por PUT, que o Jira aceita do
 * navegador: título, descrição e relator na edição da issue (os campos precisam
 * estar na tela de edição do projeto); o responsável no endpoint próprio, que só
 * pede a permissão "Atribuir itens".
 */
export async function updateIssue(issueId: string, changes: IssueChanges): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (changes.summary !== undefined) fields.summary = changes.summary;
  if (changes.description !== undefined) fields.description = changes.description ? plainTextToAdf(changes.description) : null;
  if (changes.reporter) fields.reporter = { accountId: changes.reporter.accountId };
  if (Object.keys(fields).length > 0) {
    await requestJira<void>(`rest/api/3/issue/${issueId}`, { method: 'PUT', data: { fields } });
  }
  if (changes.assignee !== undefined) {
    await requestJira<void>(`rest/api/3/issue/${issueId}/assignee`, {
      method: 'PUT',
      data: { accountId: changes.assignee?.accountId ?? null },
    });
  }
}

// ---------- Criação ----------

export interface IssueTypeOption {
  id: string;
  name: string;
  iconUrl?: string;
  /** -1 subtarefa, 0 história/tarefa/bug, 1 épico. */
  hierarchyLevel: number;
}

interface RawCreateIssueType {
  id: string;
  name: string;
  iconUrl?: string;
  subtask?: boolean;
  hierarchyLevel?: number;
}

/** Tipos que a conta pode criar no projeto. */
export async function fetchCreatableIssueTypes(projectKey: string, signal?: AbortSignal): Promise<IssueTypeOption[]> {
  const data = await requestJira<{ issueTypes?: RawCreateIssueType[]; values?: RawCreateIssueType[] }>(
    `rest/api/3/issue/createmeta/${projectKey}/issuetypes`,
    { params: { maxResults: 200 }, signal },
  );
  return (data.issueTypes ?? data.values ?? []).map((type) => ({
    id: type.id,
    name: type.name,
    iconUrl: type.iconUrl,
    hierarchyLevel: type.hierarchyLevel ?? (type.subtask ? -1 : 0),
  }));
}

/** Opção de um campo de escolha (select, cascata); na cascata, `children` são as opções do segundo nível. */
export interface CreateFieldOption {
  id: string;
  value: string;
  children: CreateFieldOption[];
}

/**
 * Formato do campo: `option` (select), `options` (seleção múltipla), `cascading`
 * (select em cascata: opção e sub-opção), `text` ou outro.
 */
export type CreateFieldKind = 'option' | 'options' | 'cascading' | 'text' | 'other';

/** Um campo da tela de criação do projeto para um tipo de issue. */
export interface CreateField {
  fieldId: string;
  name: string;
  required: boolean;
  kind: CreateFieldKind;
  options: CreateFieldOption[];
}

interface RawAllowedValue {
  id?: unknown;
  value?: unknown;
  name?: unknown;
  disabled?: unknown;
  children?: RawAllowedValue[];
}

interface RawCreateField {
  fieldId?: string;
  key?: string;
  name?: string;
  required?: boolean;
  schema?: { type?: string; items?: string; custom?: string };
  allowedValues?: RawAllowedValue[];
}

function toCreateOptions(values: RawAllowedValue[] | undefined): CreateFieldOption[] {
  return (values ?? []).flatMap((value) => {
    const label = typeof value.value === 'string' ? value.value : typeof value.name === 'string' ? value.name : null;
    if (typeof value.id !== 'string' || label === null || value.disabled === true) return [];
    return [{ id: value.id, value: label, children: toCreateOptions(value.children) }];
  });
}

function createFieldKind(schema: RawCreateField['schema']): CreateFieldKind {
  if (schema?.type === 'option-with-child' || schema?.custom?.endsWith(':cascadingselect')) return 'cascading';
  if (schema?.type === 'option') return 'option';
  if (schema?.type === 'array' && schema.items === 'option') return 'options';
  if (schema?.type === 'string') return 'text';
  return 'other';
}

/**
 * Os campos da tela de criação do projeto para o tipo de issue, com as opções
 * dos campos de escolha (ex: "Tipo de atividade" e "Atividade" da subtarefa).
 */
export async function fetchCreateFields(projectKey: string, issueTypeId: string, signal?: AbortSignal): Promise<CreateField[]> {
  const data = await requestJira<{ fields?: RawCreateField[]; values?: RawCreateField[] }>(
    `rest/api/3/issue/createmeta/${projectKey}/issuetypes/${issueTypeId}`,
    { params: { maxResults: 200 }, signal },
  );
  return (data.fields ?? data.values ?? []).flatMap((field) => {
    const fieldId = field.fieldId ?? field.key;
    if (!fieldId) return [];
    return [
      {
        fieldId,
        name: field.name ?? fieldId,
        required: field.required === true,
        kind: createFieldKind(field.schema),
        options: toCreateOptions(field.allowedValues),
      },
    ];
  });
}

export interface NewChildIssue {
  summary: string;
  issueTypeId: string;
  /** `null` = sem responsável (ou o padrão do projeto). */
  assignee: JiraUser | null;
  /** Texto simples: vira um parágrafo por linha. */
  description?: string;
  /** `null` = o padrão do Jira (quem cria). */
  reporter?: JiraUser | null;
  /** Estimativa original no formato do Jira ("3h 43m"). */
  estimate?: string;
  /** Campos personalizados já no formato do Jira (`{ id }`, `[{ id }]`, `{ id, child: { id } }`). */
  customFields?: Record<string, unknown>;
  /**
   * Os campos da tela de criação do projeto (`fetchCreateFields`). Descrição,
   * relator, estimativa e responsável que não estão nela vão logo depois, pela
   * edição da issue. Sem a lista, vai tudo na criação (e o Jira diz o que recusou).
   */
  createScreen?: ReadonlySet<string>;
}

export interface CreatedIssue {
  id: string;
  key: string;
  /** O que o Jira não aceitou depois de criar (fora da tela de criação e da de edição): "descrição", "estimativa"… */
  skipped: string[];
}

const DEFERRABLE_LABELS: Record<string, string> = {
  description: 'descrição',
  reporter: 'relator',
  timetracking: 'estimativa',
  assignee: 'responsável',
};

/** Épico aberto da squad, para a história nova ficar dentro dele. */
export interface EpicOption {
  id: string;
  key: string;
  summary: string;
}

function jqlQuote(value: string): string {
  return `"${value.replace(/["\\]/g, '')}"`;
}

/**
 * Épicos abertos do projeto. Com `query`, filtra pelo resumo (e pela chave, se
 * for uma chave de issue). Sem texto, os atualizados por último.
 */
export async function searchOpenEpics(projectKey: string, query: string, signal?: AbortSignal): Promise<EpicOption[]> {
  const text = query.trim();
  const clauses = [`project = ${jqlQuote(projectKey)}`, 'hierarchyLevel = 1', 'statusCategory != Done'];
  if (text) {
    const summary = `summary ~ ${jqlQuote(text)}`;
    const keyClause = isIssueKey(text.toUpperCase()) ? ` OR key = ${jqlQuote(text.toUpperCase())}` : '';
    clauses.push(`(${summary}${keyClause})`);
  }
  const jql = `${clauses.join(' AND ')} ORDER BY updated DESC`;
  const result = await searchIssues<{ summary?: string }>(jql, ['summary'], { signal, limit: 20 });
  return result.issues.flatMap((issue) => {
    const summary = issue.fields.summary;
    if (!summary) return [];
    return [{ id: issue.id, key: issue.key, summary }];
  });
}

/**
 * Cria uma issue no projeto. `parentKey` liga ao pai (subtarefa, ou a história
 * ao épico, quando a tela de criação tem o campo). Só existe como POST, que o
 * Jira Cloud recusa vindo do navegador ("XSRF check failed"): funciona pelo
 * proxy de escritas (ver `JIRA_WRITE_PROXY_URL`). O que a tela de criação do
 * projeto não tem vai logo depois por PUT (edição da issue e endpoint do responsável).
 */
export async function createIssue(projectKey: string, input: NewChildIssue, parentKey?: string): Promise<CreatedIssue> {
  const optional: Record<string, unknown> = {
    ...(input.description?.trim() && { description: plainTextToAdf(input.description) }),
    ...(input.reporter && { reporter: { accountId: input.reporter.accountId } }),
    ...(input.estimate?.trim() && { timetracking: { originalEstimate: input.estimate.trim() } }),
    ...(input.assignee && { assignee: { accountId: input.assignee.accountId } }),
  };
  const onCreate = (fieldId: string) => !input.createScreen || input.createScreen.has(fieldId);
  const deferred = Object.keys(optional).filter((fieldId) => !onCreate(fieldId));

  const created = await requestJira<{ id: string; key: string }>('rest/api/3/issue', {
    method: 'POST',
    data: {
      fields: {
        project: { key: projectKey },
        ...(parentKey && { parent: { key: parentKey } }),
        issuetype: { id: input.issueTypeId },
        summary: input.summary,
        ...Object.fromEntries(Object.entries(optional).filter(([fieldId]) => onCreate(fieldId))),
        ...input.customFields,
      },
    },
  });

  const skipped: string[] = [];
  const edited = deferred.filter((fieldId) => fieldId !== 'assignee');
  if (edited.length > 0) {
    try {
      const fields = Object.fromEntries(edited.map((fieldId) => [fieldId, optional[fieldId]]));
      await requestJira<void>(`rest/api/3/issue/${created.id}`, { method: 'PUT', data: { fields } });
    } catch {
      skipped.push(...edited.map((fieldId) => DEFERRABLE_LABELS[fieldId]));
    }
  }
  if (deferred.includes('assignee') && input.assignee) {
    try {
      await requestJira<void>(`rest/api/3/issue/${created.id}/assignee`, {
        method: 'PUT',
        data: { accountId: input.assignee.accountId },
      });
    } catch {
      skipped.push(DEFERRABLE_LABELS.assignee);
    }
  }
  return { ...created, skipped };
}

/** Cria uma filha da issue: subtarefa de uma história, tarefa ou bug, ou issue de um épico. */
export function createChildIssue(parentKey: string, input: NewChildIssue): Promise<CreatedIssue> {
  return createIssue(projectKeyOf(parentKey), input, parentKey);
}

/** Quanto o tempo lançado passou da estimativa original; 0 sem estimativa ou dentro dela. */
export function overEstimateSeconds(issue: Pick<JiraIssue, 'timeSpentSeconds' | 'originalEstimateSeconds'>): number {
  const estimate = issue.originalEstimateSeconds ?? 0;
  return estimate > 0 ? Math.max(0, issue.timeSpentSeconds - estimate) : 0;
}
