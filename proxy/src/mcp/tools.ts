import { type AdfNode, adfToPlainText, plainTextToAdf } from './adf';
import type { JiraClient } from './jira';
import {
  addDays,
  diffInDays,
  formatDuration,
  inZone,
  isDateKey,
  isTimeZone,
  todayIn,
  toJiraDateTime,
  weekdayName,
  zonedToInstant,
} from './time';

/**
 * As ferramentas do MCP: criar subtarefa, ler história, buscar issues, ler
 * worklogs, lançar horas e mudar status. Cada chamada usa as credenciais do header
 * `Authorization` da própria chamada (ver `server.ts`): a conta do token é quem
 * lê e escreve, com as permissões dela no Jira.
 */

type Args = Record<string, unknown>;

interface JsonSchemaProperty {
  type: 'string' | 'boolean';
  description: string;
  enum?: string[];
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required?: string[];
    additionalProperties: false;
  };
  annotations: {
    title: string;
    readOnlyHint: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint: boolean;
  };
}

export interface ToolContext {
  jira: JiraClient;
  siteUrl: string | null;
}

interface Tool extends ToolDefinition {
  run(args: Args, context: ToolContext): Promise<ToolResult>;
}

/** Argumento inválido: vira um resultado com erro, para o modelo corrigir e tentar de novo. */
export class InputError extends Error {}

export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';
/** Período máximo de `ler_worklogs`: o Worker tem um limite de requisições por chamada. */
const MAX_WORKLOG_RANGE_DAYS = 31;
/** Issues com mais de 20 apontamentos buscam os do período uma a uma: no máximo estas. */
const MAX_EXTRA_WORKLOG_FETCHES = 25;
const MAX_SEARCH_ISSUES = 300;
const MAX_ISSUE_SEARCH = 50;
const MAX_CHILDREN = 100;
const MAX_DESCRIPTION_CHARS = 20_000;

// ---------- Argumentos ----------

function optionalText(args: Args, name: string): string | undefined {
  const value = args[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new InputError(`"${name}" precisa ser texto.`);
  const trimmed = value.trim();
  return trimmed || undefined;
}

function requiredText(args: Args, name: string): string {
  const value = optionalText(args, name);
  if (!value) throw new InputError(`Falta "${name}".`);
  return value;
}

function optionalBoolean(args: Args, name: string, fallback: boolean): boolean {
  const value = args[name];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw new InputError(`"${name}" precisa ser true ou false.`);
  return value;
}

/** Chave da issue, aceitando também o link dela (ex: .../browse/CLI-5151). */
function issueKeyArg(args: Args, name: string): string {
  const value = requiredText(args, name);
  const match = /([A-Za-z][A-Za-z0-9_]*-\d+)(?:[/?#][^/]*)?$/.exec(value);
  if (!match) throw new InputError(`"${name}" precisa ser a chave de uma issue, como CLI-5151 (recebido: "${value}").`);
  return match[1].toUpperCase();
}

function timeZoneArg(args: Args): string {
  const timeZone = optionalText(args, 'timeZone') ?? DEFAULT_TIME_ZONE;
  if (!isTimeZone(timeZone)) throw new InputError(`Fuso desconhecido: "${timeZone}". Use um fuso IANA, como America/Sao_Paulo.`);
  return timeZone;
}

function dateArg(args: Args, name: string, fallback: string): string {
  const value = optionalText(args, name);
  if (!value) return fallback;
  if (!isDateKey(value)) throw new InputError(`"${name}" precisa ser uma data AAAA-MM-DD (recebido: "${value}").`);
  return value;
}

function clockArg(args: Args, name: string): string | undefined {
  const value = optionalText(args, name);
  if (!value) return undefined;
  const match = /^(\d{1,2})(?::|h)?(\d{2})?$/i.exec(value);
  const hours = Number(match?.[1]);
  const minutes = Number(match?.[2] ?? 0);
  if (!match || hours > 23 || minutes > 59) throw new InputError(`"${name}" precisa ser um horário HH:MM (recebido: "${value}").`);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** "1h 30m", "1h30", "90m", "1:30", "2h", "1.5h", "45" (minutos). */
function durationSeconds(value: string): number | null {
  const text = value.trim().toLowerCase().replace(',', '.');
  if (/^\d+$/.test(text)) return Number(text) * 60;
  const clock = /^(\d+):(\d{2})$/.exec(text);
  if (clock) return Number(clock[1]) * 3600 + Number(clock[2]) * 60;
  const parts = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m?(?:in)?)?$/.exec(text);
  if (!parts || (!parts[1] && !parts[2])) return null;
  return Math.round(Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60);
}

/** "me": a conta do token. */
function isMe(value: string): boolean {
  return /^(me|eu|myself|currentuser\(\))$/i.test(value);
}

function accountIdLike(value: string): boolean {
  return /^[0-9a-f]{24}$/i.test(value) || /^\d+:[0-9a-f-]{20,}$/i.test(value);
}

// ---------- Jira ----------

interface RawUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  active?: boolean;
  accountType?: string;
}

interface RawIssueType {
  id: string;
  name: string;
  subtask?: boolean;
  hierarchyLevel?: number;
}

interface RawStatus {
  name: string;
  statusCategory?: { key: string; name: string };
}

interface RawTimeTracking {
  originalEstimateSeconds?: number;
  remainingEstimateSeconds?: number;
  timeSpentSeconds?: number;
}

interface RawIssueFields {
  summary?: string;
  description?: AdfNode | null;
  status?: RawStatus;
  issuetype?: RawIssueType;
  project?: { id: string; key: string; name: string };
  parent?: { key: string; fields?: { summary?: string; issuetype?: RawIssueType; status?: RawStatus } };
  assignee?: RawUser | null;
  reporter?: RawUser | null;
  priority?: { name: string } | null;
  labels?: string[];
  created?: string;
  updated?: string;
  duedate?: string | null;
  timetracking?: RawTimeTracking;
  aggregatetimespent?: number | null;
  aggregatetimeoriginalestimate?: number | null;
  aggregatetimeestimate?: number | null;
  subtasks?: Array<{ key: string }>;
  worklog?: { total: number; worklogs: RawWorklog[] };
}

interface RawIssue {
  id: string;
  key: string;
  fields: RawIssueFields;
}

interface RawWorklog {
  id: string;
  author?: RawUser;
  started: string;
  timeSpentSeconds: number;
  comment?: AdfNode;
}

interface RawTransition {
  id: string;
  name: string;
  to?: RawStatus & { id?: string };
}

function issueLevel(type: RawIssueType | undefined): number {
  return type?.hierarchyLevel ?? (type?.subtask ? -1 : 0);
}

const MISSING_SITE =
  'Falta o header X-Jira-Site-Url nesta conexão MCP. No Team Reports, em Configurações > MCP, instale de novo para o endereço do site ir junto.';

function browseUrl(siteUrl: string | null, key: string): string {
  if (!siteUrl) throw new InputError(MISSING_SITE);
  return `${siteUrl}/browse/${key}`;
}

function getIssue(jira: JiraClient, key: string, fields: string): Promise<RawIssue> {
  return jira.get<RawIssue>(`rest/api/3/issue/${encodeURIComponent(key)}`, { fields });
}

interface SearchPage {
  issues?: RawIssue[];
  nextPageToken?: string;
  isLast?: boolean;
}

/** Busca por JQL (GET, paginada por `nextPageToken`) até `limit` issues. */
async function searchIssues(
  jira: JiraClient,
  jql: string,
  fields: string,
  limit: number,
): Promise<{ issues: RawIssue[]; isTruncated: boolean }> {
  const issues: RawIssue[] = [];
  let nextPageToken: string | undefined;
  for (;;) {
    const page = await jira.get<SearchPage>('rest/api/3/search/jql', {
      jql,
      fields,
      maxResults: Math.min(100, limit),
      nextPageToken,
    });
    issues.push(...(page.issues ?? []));
    const hasMore = !page.isLast && Boolean(page.nextPageToken);
    if (!hasMore) return { issues, isTruncated: false };
    if (issues.length >= limit) return { issues: issues.slice(0, limit), isTruncated: true };
    nextPageToken = page.nextPageToken;
  }
}

async function fetchIssueWorklogs(jira: JiraClient, issueId: string, after: number, before: number): Promise<RawWorklog[]> {
  const worklogs: RawWorklog[] = [];
  for (let startAt = 0; ; ) {
    const page = await jira.get<{ worklogs: RawWorklog[]; total: number }>(`rest/api/3/issue/${issueId}/worklog`, {
      startAt,
      maxResults: 5000,
      startedAfter: after,
      startedBefore: before,
    });
    worklogs.push(...page.worklogs);
    startAt += page.worklogs.length;
    if (page.worklogs.length === 0 || startAt >= page.total) return worklogs;
  }
}

interface Person {
  accountId: string;
  displayName: string;
}

/**
 * A pessoa de um argumento: "me" (a conta do token), um accountId ou parte do
 * nome ou do e-mail. Pelo nome, `assignableTo` limita a busca a quem pode ser
 * responsável pela issue; com mais de uma pessoa, a lista vai no erro.
 */
async function resolvePerson(jira: JiraClient, value: string, assignableTo?: string): Promise<Person> {
  if (isMe(value)) return jira.myself();
  if (accountIdLike(value)) return jira.get<RawUser>('rest/api/3/user', { accountId: value });
  const users = assignableTo
    ? await jira.get<RawUser[]>('rest/api/3/user/assignable/search', { issueKey: assignableTo, query: value, maxResults: 20 })
    : await jira.get<RawUser[]>('rest/api/3/user/search', { query: value, maxResults: 20 });
  const people = users.filter((user) => user.accountType !== 'app' && user.active !== false);
  if (people.length === 1) return people[0];
  const exact = people.filter((user) => normalize(user.displayName) === normalize(value));
  if (exact.length === 1) return exact[0];
  if (people.length === 0) throw new InputError(`Nenhuma pessoa encontrada para "${value}".`);
  const options = people.map((user) => `${user.displayName} (accountId ${user.accountId})`).join('; ');
  throw new InputError(`Mais de uma pessoa para "${value}": ${options}. Passe o accountId.`);
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function textResult(text: string, structuredContent?: Record<string, unknown>): ToolResult {
  return { content: [{ type: 'text', text }], ...(structuredContent && { structuredContent }) };
}

function formatTimeTracking(spent: number | undefined, estimate: number | undefined, remaining: number | undefined): string {
  const parts = [`lançado ${formatDuration(spent ?? 0)}`];
  if (estimate) parts.push(`estimativa ${formatDuration(estimate)}`);
  if (remaining !== undefined && (estimate || remaining)) parts.push(`restante ${formatDuration(remaining)}`);
  if (estimate && (spent ?? 0) > estimate) parts.push(`${formatDuration((spent ?? 0) - estimate)} acima da estimativa`);
  return parts.join(' · ');
}

function dateOnly(value: string | undefined | null, timeZone: string): string | undefined {
  return value ? inZone(value, timeZone).date : undefined;
}

// ---------- criar_subtarefa ----------

const createSubtask: Tool = {
  name: 'criar_subtarefa',
  title: 'Criar subtarefa',
  description:
    'Cria uma subtarefa numa história, tarefa ou bug do Jira, no projeto da issue pai. Devolve a chave e o link da subtarefa criada. Épicos e subtarefas não recebem subtarefas.',
  inputSchema: {
    type: 'object',
    properties: {
      parentKey: { type: 'string', description: 'Chave da issue pai (história, tarefa ou bug), ex: CLI-5151. Aceita o link da issue.' },
      summary: { type: 'string', description: 'Título da subtarefa.' },
      description: { type: 'string', description: 'Descrição em texto simples (opcional). Cada linha vira um parágrafo.' },
      assignee: {
        type: 'string',
        description:
          'Responsável (opcional): "me" para a conta do token, o accountId ou o nome da pessoa. Sem ele, vale o padrão do projeto.',
      },
      issueType: {
        type: 'string',
        description: 'Nome do tipo de subtarefa, quando o projeto tem mais de um (opcional; sem ele, o primeiro tipo de subtarefa).',
      },
    },
    required: ['parentKey', 'summary'],
    additionalProperties: false,
  },
  annotations: { title: 'Criar subtarefa', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async run(args, { jira, siteUrl }) {
    const parentKey = issueKeyArg(args, 'parentKey');
    const summary = requiredText(args, 'summary');
    if (summary.length > 255) throw new InputError('O título passa de 255 caracteres.');
    const description = optionalText(args, 'description');
    const assigneeArg = optionalText(args, 'assignee');
    const typeName = optionalText(args, 'issueType');

    const parent = await getIssue(jira, parentKey, 'summary,issuetype,project');
    const level = issueLevel(parent.fields.issuetype);
    if (level < 0) throw new InputError(`${parentKey} já é uma subtarefa: subtarefas não têm filhas. Use a issue pai dela.`);
    if (level > 0) {
      throw new InputError(`${parentKey} é um ${parent.fields.issuetype?.name ?? 'épico'}: as filhas dele são histórias ou tarefas, não subtarefas.`);
    }
    const project = parent.fields.project;
    if (!project) throw new Error(`O Jira não informou o projeto de ${parentKey}.`);

    const meta = await jira.get<{ issueTypes?: RawIssueType[]; values?: RawIssueType[] }>(
      `rest/api/3/issue/createmeta/${encodeURIComponent(project.key)}/issuetypes`,
      { maxResults: 200 },
    );
    const subtaskTypes = (meta.issueTypes ?? meta.values ?? []).filter((type) => issueLevel(type) < 0);
    if (subtaskTypes.length === 0) throw new Error(`A conta não pode criar subtarefas no projeto ${project.key}.`);
    const issueType = typeName ? subtaskTypes.find((type) => normalize(type.name) === normalize(typeName)) : subtaskTypes[0];
    if (!issueType) {
      throw new InputError(`Tipo "${typeName}" não encontrado. Tipos de subtarefa em ${project.key}: ${subtaskTypes.map((type) => type.name).join(', ')}.`);
    }
    const assignee = assigneeArg ? await resolvePerson(jira, assigneeArg, parentKey) : undefined;

    const created = await jira.post<{ id: string; key: string }>('rest/api/3/issue', {
      fields: {
        project: { id: project.id },
        parent: { key: parentKey },
        issuetype: { id: issueType.id },
        summary,
        ...(description && { description: plainTextToAdf(description) }),
        ...(assignee && { assignee: { accountId: assignee.accountId } }),
      },
    });
    const url = browseUrl(siteUrl, created.key);
    const lines = [
      `Subtarefa ${created.key} criada em ${parentKey} (${parent.fields.summary ?? ''}).`,
      `Título: ${summary}`,
      `Tipo: ${issueType.name}`,
      ...(assignee ? [`Responsável: ${assignee.displayName}`] : []),
      `Link: ${url}`,
    ];
    return textResult(lines.join('\n'), {
      key: created.key,
      id: created.id,
      url,
      parentKey,
      summary,
      issueType: issueType.name,
      assignee: assignee ?? null,
    });
  },
};

// ---------- ler_historia ----------

const ISSUE_FIELDS = [
  'summary',
  'description',
  'status',
  'issuetype',
  'project',
  'parent',
  'assignee',
  'reporter',
  'priority',
  'labels',
  'created',
  'updated',
  'duedate',
  'timetracking',
  'aggregatetimespent',
  'aggregatetimeoriginalestimate',
  'aggregatetimeestimate',
].join(',');

const CHILD_FIELDS = 'summary,status,issuetype,assignee,timetracking';

const readStory: Tool = {
  name: 'ler_historia',
  title: 'Ler história',
  description:
    'Lê uma issue do Jira (história, tarefa, bug, épico ou subtarefa): título, status, tipo, responsável, relator, prioridade, issue pai, rótulos, datas, controle de tempo, a descrição em texto simples e as filhas (subtarefas, ou as issues de um épico).',
  inputSchema: {
    type: 'object',
    properties: {
      issueKey: { type: 'string', description: 'Chave da issue, ex: CLI-5151. Aceita o link da issue.' },
      includeChildren: { type: 'boolean', description: 'Listar as filhas (padrão: true).' },
      timeZone: { type: 'string', description: `Fuso IANA das datas (padrão: ${DEFAULT_TIME_ZONE}).` },
    },
    required: ['issueKey'],
    additionalProperties: false,
  },
  annotations: { title: 'Ler história', readOnlyHint: true, openWorldHint: true },
  async run(args, { jira, siteUrl }) {
    const issueKey = issueKeyArg(args, 'issueKey');
    const includeChildren = optionalBoolean(args, 'includeChildren', true);
    const timeZone = timeZoneArg(args);

    const issue = await getIssue(jira, issueKey, ISSUE_FIELDS);
    const fields = issue.fields;
    const isSubtask = issueLevel(fields.issuetype) < 0;
    const children =
      includeChildren && !isSubtask
        ? await searchIssues(jira, `parent = ${issue.key} ORDER BY Rank ASC`, CHILD_FIELDS, MAX_CHILDREN)
        : { issues: [], isTruncated: false };

    const own = fields.timetracking ?? {};
    // Com filhas, o Jira soma as delas em `aggregate*` (como o controle de tempo da issue pai no app).
    const hasChildren = children.issues.length > 0;
    const spent = hasChildren ? (fields.aggregatetimespent ?? own.timeSpentSeconds) : own.timeSpentSeconds;
    const estimate = hasChildren ? (fields.aggregatetimeoriginalestimate ?? own.originalEstimateSeconds) : own.originalEstimateSeconds;
    const remaining = hasChildren ? (fields.aggregatetimeestimate ?? own.remainingEstimateSeconds) : own.remainingEstimateSeconds;

    let description = adfToPlainText(fields.description);
    if (description.length > MAX_DESCRIPTION_CHARS) description = `${description.slice(0, MAX_DESCRIPTION_CHARS)}\n[descrição cortada]`;
    const url = browseUrl(siteUrl, issue.key);
    const doneChildren = children.issues.filter((child) => child.fields.status?.statusCategory?.key === 'done').length;

    const lines = [
      `${issue.key} · ${fields.issuetype?.name ?? '?'} · ${fields.status?.name ?? '?'}`,
      `Título: ${fields.summary ?? ''}`,
      `Link: ${url}`,
      `Projeto: ${fields.project ? `${fields.project.key} (${fields.project.name})` : '?'}`,
    ];
    if (fields.parent) {
      const parent = fields.parent.fields;
      lines.push(`Issue pai: ${fields.parent.key}${parent?.issuetype ? ` (${parent.issuetype.name})` : ''}${parent?.summary ? ` · ${parent.summary}` : ''}`);
    }
    lines.push(
      `Responsável: ${fields.assignee?.displayName ?? 'sem responsável'} · Relator: ${fields.reporter?.displayName ?? '?'} · Prioridade: ${fields.priority?.name ?? '?'}`,
    );
    if (fields.labels?.length) lines.push(`Rótulos: ${fields.labels.join(', ')}`);
    lines.push(
      `Criada: ${dateOnly(fields.created, timeZone) ?? '?'} · Atualizada: ${dateOnly(fields.updated, timeZone) ?? '?'}${fields.duedate ? ` · Entrega: ${fields.duedate}` : ''}`,
      `Tempo${hasChildren ? ' (com as filhas)' : ''}: ${formatTimeTracking(spent, estimate, remaining)}`,
      '',
      'Descrição:',
      description || '(sem descrição)',
    );
    if (includeChildren && !isSubtask) {
      lines.push('');
      if (hasChildren) {
        lines.push(`Filhas (${children.issues.length}${children.isTruncated ? '+' : ''}, ${doneChildren} ${doneChildren === 1 ? 'concluída' : 'concluídas'}):`);
        for (const child of children.issues) {
          const tracking = child.fields.timetracking ?? {};
          lines.push(
            `- ${child.key} · ${child.fields.issuetype?.name ?? '?'} · ${child.fields.status?.name ?? '?'} · ${child.fields.assignee?.displayName ?? 'sem responsável'} · ${child.fields.summary ?? ''} (${formatTimeTracking(tracking.timeSpentSeconds, tracking.originalEstimateSeconds, tracking.remainingEstimateSeconds)})`,
          );
        }
        if (children.isTruncated) lines.push(`(mostrando as primeiras ${MAX_CHILDREN})`);
      } else {
        lines.push('Sem filhas.');
      }
    }

    return textResult(lines.join('\n'), {
      key: issue.key,
      url,
      summary: fields.summary ?? '',
      type: fields.issuetype?.name ?? null,
      status: fields.status?.name ?? null,
      statusCategory: fields.status?.statusCategory?.key ?? null,
      project: fields.project ? { key: fields.project.key, name: fields.project.name } : null,
      parent: fields.parent ? { key: fields.parent.key, summary: fields.parent.fields?.summary ?? null } : null,
      assignee: fields.assignee ? { accountId: fields.assignee.accountId, displayName: fields.assignee.displayName } : null,
      reporter: fields.reporter ? { accountId: fields.reporter.accountId, displayName: fields.reporter.displayName } : null,
      priority: fields.priority?.name ?? null,
      labels: fields.labels ?? [],
      created: fields.created ?? null,
      updated: fields.updated ?? null,
      dueDate: fields.duedate ?? null,
      timeTracking: { spentSeconds: spent ?? 0, originalEstimateSeconds: estimate ?? null, remainingSeconds: remaining ?? null },
      description,
      children: children.issues.map((child) => ({
        key: child.key,
        summary: child.fields.summary ?? '',
        type: child.fields.issuetype?.name ?? null,
        status: child.fields.status?.name ?? null,
        isDone: child.fields.status?.statusCategory?.key === 'done',
        assignee: child.fields.assignee?.displayName ?? null,
      })),
    });
  },
};

// ---------- buscar_issues ----------

const SEARCH_ISSUE_FIELDS = 'summary,status,issuetype,parent,assignee,priority,updated';

function jqlQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function statusCategoryName(value: string): string {
  const key = normalize(value);
  if (key === 'to do' || key === 'todo' || key === 'a fazer' || key === 'new') return 'To Do';
  if (key === 'in progress' || key === 'em andamento' || key === 'andamento' || key === 'indeterminate') return 'In Progress';
  if (key === 'done' || key === 'concluido' || key === 'complete') return 'Done';
  throw new InputError(`"statusCategory" é "To Do", "In Progress" ou "Done" (recebido: "${value}"). "In Progress" são as em andamento.`);
}

function assigneeClause(value: string): 'me' | 'all' | 'empty' | 'person' {
  const key = normalize(value);
  if (isMe(value)) return 'me';
  if (key === 'all' || key === 'todos' || key === 'todas' || key === 'qualquer' || key === 'anyone') return 'all';
  if (key === 'none' || key === 'ninguem' || key === 'unassigned' || key === 'sem responsavel') return 'empty';
  return 'person';
}

function projectClause(value: string): string {
  const key = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,10}$/.test(key)) throw new InputError(`"project" precisa ser a chave do projeto, como CLI (recebido: "${value}").`);
  return `project = ${key}`;
}

function textClause(value: string): string {
  if (value.length > 100) throw new InputError('"text" aceita até 100 caracteres.');
  const summary = `summary ~ ${jqlQuote(value)}`;
  const key = /^[A-Za-z][A-Za-z0-9]*-\d+$/.exec(value.trim());
  return key ? `(${summary} OR key = ${key[0].toUpperCase()})` : summary;
}

const findIssues: Tool = {
  name: 'buscar_issues',
  title: 'Buscar issues',
  description:
    'Busca issues do Jira por responsável, status, projeto ou trecho do título. Sem "assignee", vale a conta do token. Para as em andamento, use statusCategory "In Progress". Devolve até 50, as atualizadas por último, com chave, tipo, status, título, pai e link.',
  inputSchema: {
    type: 'object',
    properties: {
      assignee: {
        type: 'string',
        description:
          'Responsável: "me" (padrão, a conta do token), o accountId ou o nome. "all" para qualquer pessoa. "none" para sem responsável.',
      },
      statusCategory: {
        type: 'string',
        enum: ['To Do', 'In Progress', 'Done'],
        description: 'Categoria de status. "In Progress" são as em andamento, seja qual for o nome do status no fluxo.',
      },
      status: { type: 'string', description: 'Nome do status no fluxo, como "Em andamento".' },
      project: { type: 'string', description: 'Chave do projeto, como CLI.' },
      text: { type: 'string', description: 'Trecho do título. Se for uma chave (CLI-5151), busca a chave também.' },
      timeZone: { type: 'string', description: `Fuso IANA da data de atualização (padrão: ${DEFAULT_TIME_ZONE}).` },
    },
    additionalProperties: false,
  },
  annotations: { title: 'Buscar issues', readOnlyHint: true, openWorldHint: true },
  async run(args, { jira, siteUrl }) {
    const assigneeArg = optionalText(args, 'assignee') ?? 'me';
    const mode = assigneeClause(assigneeArg);
    const statusCategory = optionalText(args, 'statusCategory');
    const status = optionalText(args, 'status');
    const project = optionalText(args, 'project');
    const text = optionalText(args, 'text');
    const timeZone = timeZoneArg(args);
    if (status && status.length > 80) throw new InputError('"status" aceita até 80 caracteres.');

    const clauses: string[] = [];
    if (mode === 'me') clauses.push('assignee = currentUser()');
    else if (mode === 'empty') clauses.push('assignee is EMPTY');
    else if (mode === 'person') {
      const person = await resolvePerson(jira, assigneeArg);
      clauses.push(`assignee = ${jqlQuote(person.accountId)}`);
    }
    if (statusCategory) clauses.push(`statusCategory = ${jqlQuote(statusCategoryName(statusCategory))}`);
    if (status) clauses.push(`status = ${jqlQuote(status)}`);
    if (project) clauses.push(projectClause(project));
    if (text) clauses.push(textClause(text));
    if (clauses.length === 0) {
      throw new InputError('Com responsável "all", informe também status, projeto ou texto.');
    }

    const jql = `${clauses.join(' AND ')} ORDER BY updated DESC`;
    const result = await searchIssues(jira, jql, SEARCH_ISSUE_FIELDS, MAX_ISSUE_SEARCH);
    const count = result.issues.length;
    const lines = [
      count === 0 ? `Nenhuma issue para ${jql}` : `${count}${result.isTruncated ? '+' : ''} ${count === 1 ? 'issue' : 'issues'} para ${jql}`,
    ];
    if (result.isTruncated) lines.push(`Mostrando as ${MAX_ISSUE_SEARCH} atualizadas por último.`);
    const issues = result.issues.map((issue) => {
      const fields = issue.fields;
      const parent = fields.parent;
      const url = browseUrl(siteUrl, issue.key);
      lines.push(
        '',
        `${issue.key} · ${fields.issuetype?.name ?? '?'} · ${fields.status?.name ?? '?'} · ${fields.assignee?.displayName ?? 'sem responsável'}`,
        fields.summary ?? '',
      );
      if (parent?.key) lines.push(`Pai: ${parent.key}${parent.fields?.summary ? ` · ${parent.fields.summary}` : ''}`);
      lines.push(`Atualizada: ${dateOnly(fields.updated, timeZone) ?? '?'}`, url);
      return {
        key: issue.key,
        url,
        summary: fields.summary ?? '',
        type: fields.issuetype?.name ?? null,
        status: fields.status?.name ?? null,
        statusCategory: fields.status?.statusCategory?.key ?? null,
        assignee: fields.assignee?.displayName ?? null,
        parent: parent?.key ? { key: parent.key, summary: parent.fields?.summary ?? null } : null,
        updated: fields.updated ?? null,
      };
    });

    return textResult(lines.join('\n'), { jql, isTruncated: result.isTruncated, issues });
  },
};

// ---------- ler_worklogs ----------

interface WorklogItem {
  id: string;
  issueKey: string;
  issueSummary: string;
  author: string;
  authorAccountId: string | null;
  date: string;
  start: string;
  end: string;
  seconds: number;
  description: string;
}

const readWorklogs: Tool = {
  name: 'ler_worklogs',
  title: 'Ler worklogs',
  description: `Lista os apontamentos de horas (worklogs) do Jira num período, agrupados por dia, com início, fim, duração, issue e descrição. Com "issueKey", os da issue (de todas as pessoas, ou só de "author"). Sem "issueKey", os de uma pessoa em qualquer issue (padrão: a conta do token). Período padrão: os últimos 7 dias; no máximo ${MAX_WORKLOG_RANGE_DAYS} dias.`,
  inputSchema: {
    type: 'object',
    properties: {
      issueKey: { type: 'string', description: 'Chave da issue (opcional), ex: CLI-5151.' },
      from: { type: 'string', description: 'Primeiro dia, AAAA-MM-DD (padrão: 6 dias antes de "to").' },
      to: { type: 'string', description: 'Último dia, AAAA-MM-DD (padrão: hoje).' },
      author: {
        type: 'string',
        description:
          'De quem: "me" (a conta do token), o accountId ou o nome da pessoa. Sem "issueKey", o padrão é "me"; com "issueKey", todas as pessoas.',
      },
      timeZone: { type: 'string', description: `Fuso IANA dos dias e horários (padrão: ${DEFAULT_TIME_ZONE}).` },
    },
    additionalProperties: false,
  },
  annotations: { title: 'Ler worklogs', readOnlyHint: true, openWorldHint: true },
  async run(args, { jira, siteUrl }) {
    const issueKey = optionalText(args, 'issueKey') ? issueKeyArg(args, 'issueKey') : undefined;
    const timeZone = timeZoneArg(args);
    const to = dateArg(args, 'to', todayIn(timeZone));
    const from = dateArg(args, 'from', addDays(to, -6));
    if (diffInDays(from, to) < 0) throw new InputError('"from" precisa ser antes de "to".');
    if (diffInDays(from, to) >= MAX_WORKLOG_RANGE_DAYS) {
      throw new InputError(`Período de no máximo ${MAX_WORKLOG_RANGE_DAYS} dias: divida em mais de uma chamada.`);
    }
    const authorArg = optionalText(args, 'author') ?? (issueKey ? undefined : 'me');
    const author = authorArg ? await resolvePerson(jira, authorArg) : undefined;

    const start = zonedToInstant(from, '00:00', timeZone).getTime();
    const end = zonedToInstant(addDays(to, 1), '00:00', timeZone).getTime();
    const raws: Array<{ raw: RawWorklog; issue: RawIssue }> = [];
    let isPartial = false;

    if (issueKey) {
      const issue = await getIssue(jira, issueKey, 'summary');
      for (const raw of await fetchIssueWorklogs(jira, issue.id, start, end)) raws.push({ raw, issue });
    } else if (author) {
      // O Jira avalia `worklogDate` no fuso do dono do token: um dia de folga para cada lado; o corte exato é feito abaixo.
      const who = authorArg && isMe(authorArg) ? 'currentUser()' : `"${author.accountId}"`;
      const jql = `worklogAuthor = ${who} AND worklogDate >= "${addDays(from, -1)}" AND worklogDate <= "${addDays(to, 1)}" ORDER BY updated DESC`;
      const search = await searchIssues(jira, jql, 'summary,worklog', MAX_SEARCH_ISSUES);
      isPartial = search.isTruncated;
      let extraFetches = 0;
      for (const issue of search.issues) {
        const embedded = issue.fields.worklog;
        let worklogs = embedded?.worklogs ?? [];
        // A busca traz no máximo 20 apontamentos por issue: os demais vêm do endpoint da issue.
        if (embedded && embedded.total > embedded.worklogs.length) {
          if (extraFetches < MAX_EXTRA_WORKLOG_FETCHES) {
            extraFetches += 1;
            worklogs = await fetchIssueWorklogs(jira, issue.id, start, end);
          } else {
            isPartial = true;
          }
        }
        for (const raw of worklogs) raws.push({ raw, issue });
      }
    }

    const items: WorklogItem[] = [];
    for (const { raw, issue } of raws) {
      const startedAt = Date.parse(raw.started);
      if (startedAt < start || startedAt >= end) continue;
      if (author && raw.author?.accountId !== author.accountId) continue;
      const startClock = inZone(raw.started, timeZone);
      items.push({
        id: raw.id,
        issueKey: issue.key,
        issueSummary: issue.fields.summary ?? '',
        author: raw.author?.displayName ?? '?',
        authorAccountId: raw.author?.accountId ?? null,
        date: startClock.date,
        start: startClock.time,
        end: inZone(new Date(startedAt + raw.timeSpentSeconds * 1000), timeZone).time,
        seconds: raw.timeSpentSeconds,
        description: adfToPlainText(raw.comment),
      });
    }
    items.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

    const total = items.reduce((sum, item) => sum + item.seconds, 0);
    const scope = issueKey ? `em ${issueKey}${author ? ` de ${author.displayName}` : ''}` : `de ${author?.displayName ?? '?'}`;
    const lines = [`Apontamentos ${scope}, de ${from} a ${to} (${timeZone}): ${formatDuration(total)} em ${items.length} apontamentos.`];
    if (isPartial) lines.push('Atenção: resultado parcial (muitas issues no período); use um período menor.');
    const days = new Map<string, WorklogItem[]>();
    for (const item of items) days.set(item.date, [...(days.get(item.date) ?? []), item]);
    const perDay: Array<{ date: string; seconds: number }> = [];
    for (const [date, dayItems] of days) {
      const daySeconds = dayItems.reduce((sum, item) => sum + item.seconds, 0);
      perDay.push({ date, seconds: daySeconds });
      lines.push('', `${weekdayName(date)}, ${date}: ${formatDuration(daySeconds)}`);
      for (const item of dayItems) {
        const who = issueKey && !author ? ` · ${item.author}` : '';
        const what = issueKey ? '' : ` ${item.issueKey} (${item.issueSummary})`;
        lines.push(
          `- ${item.start}–${item.end} (${formatDuration(item.seconds)})${what}${who}${item.description ? `: ${item.description.replace(/\n+/g, ' / ')}` : ''} [worklog ${item.id}]`,
        );
      }
    }

    return textResult(lines.join('\n'), {
      from,
      to,
      timeZone,
      issueKey: issueKey ?? null,
      issueUrl: issueKey ? browseUrl(siteUrl, issueKey) : null,
      author: author ?? null,
      totalSeconds: total,
      isPartial,
      days: perDay,
      worklogs: items,
    });
  },
};

// ---------- lancar_horas ----------

const logWork: Tool = {
  name: 'lancar_horas',
  title: 'Lançar horas',
  description:
    'Lança horas (um apontamento de trabalho) numa issue do Jira em nome da conta do token: data, hora de início e hora de fim (ou a duração), e uma descrição opcional. Issues pai (épicos ou issues com subtarefas) não recebem horas: lance nas subtarefas.',
  inputSchema: {
    type: 'object',
    properties: {
      issueKey: { type: 'string', description: 'Chave da issue, ex: CLI-5151. Aceita o link da issue.' },
      date: { type: 'string', description: 'Dia do trabalho, AAAA-MM-DD (padrão: hoje no fuso).' },
      start: { type: 'string', description: 'Hora de início, HH:MM (ex: 09:00).' },
      end: { type: 'string', description: 'Hora de fim, HH:MM (ex: 10:30). Informe "end" ou "duration".' },
      duration: { type: 'string', description: 'Duração, se não houver "end": "1h 30m", "90m", "1:30" ou "2h".' },
      description: { type: 'string', description: 'O que foi feito (opcional). Cada linha vira um parágrafo.' },
      timeZone: { type: 'string', description: `Fuso IANA de data e horários (padrão: ${DEFAULT_TIME_ZONE}).` },
    },
    required: ['issueKey', 'start'],
    additionalProperties: false,
  },
  annotations: { title: 'Lançar horas', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async run(args, { jira, siteUrl }) {
    const issueKey = issueKeyArg(args, 'issueKey');
    const timeZone = timeZoneArg(args);
    const date = dateArg(args, 'date', todayIn(timeZone));
    const start = clockArg(args, 'start');
    if (!start) throw new InputError('Falta "start" (hora de início, HH:MM).');
    const end = clockArg(args, 'end');
    const durationArg = optionalText(args, 'duration');
    const description = optionalText(args, 'description');

    const startedAt = zonedToInstant(date, start, timeZone);
    let seconds: number;
    if (end) {
      seconds = (zonedToInstant(date, end, timeZone).getTime() - startedAt.getTime()) / 1000;
      if (seconds <= 0) throw new InputError(`O fim (${end}) precisa ser depois do início (${start}) no mesmo dia.`);
    } else if (durationArg) {
      const parsed = durationSeconds(durationArg);
      if (!parsed) throw new InputError(`Duração inválida: "${durationArg}". Use "1h 30m", "90m" ou "1:30".`);
      seconds = parsed;
    } else {
      throw new InputError('Informe "end" (hora de fim) ou "duration".');
    }
    if (seconds < 60) throw new InputError('O apontamento precisa ter pelo menos 1 minuto.');
    if (seconds > 24 * 3600) throw new InputError('O apontamento passa de 24 horas.');

    const issue = await getIssue(jira, issueKey, 'summary,issuetype,subtasks,status');
    const level = issueLevel(issue.fields.issuetype);
    if (level > 0 || (issue.fields.subtasks?.length ?? 0) > 0) {
      const what = level > 0 ? `um ${issue.fields.issuetype?.name ?? 'épico'}` : 'uma issue pai (tem subtarefas)';
      throw new InputError(`${issueKey} é ${what}: as horas vão nas filhas. Lance numa subtarefa dela.`);
    }

    const worklog = await jira.post<RawWorklog>(`rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`, {
      started: toJiraDateTime(startedAt),
      timeSpentSeconds: seconds,
      ...(description && { comment: plainTextToAdf(description) }),
    });
    const endClock = inZone(new Date(startedAt.getTime() + seconds * 1000), timeZone).time;
    const url = browseUrl(siteUrl, issueKey);
    const lines = [
      `Lançado: ${formatDuration(seconds)} em ${issueKey} (${issue.fields.summary ?? ''}).`,
      `Quando: ${date}, das ${start} às ${endClock} (${timeZone}).`,
      ...(description ? [`Descrição: ${description}`] : []),
      `Apontamento: ${worklog.id} · ${url}`,
    ];
    return textResult(lines.join('\n'), {
      worklogId: worklog.id,
      issueKey,
      url,
      date,
      start,
      end: endClock,
      timeZone,
      seconds,
      description: description ?? '',
    });
  },
};

// ---------- mudar_status ----------

const changeStatus: Tool = {
  name: 'mudar_status',
  title: 'Mudar status',
  description:
    'Muda o status de uma issue do Jira por uma das transições possíveis a partir do status atual (ex: "Em andamento", "Concluído"). Se o status pedido não for alcançável, a resposta lista os possíveis.',
  inputSchema: {
    type: 'object',
    properties: {
      issueKey: { type: 'string', description: 'Chave da issue, ex: CLI-5151. Aceita o link da issue.' },
      status: {
        type: 'string',
        description: 'O status de destino (ou o nome da transição), sem diferenciar maiúsculas nem acentos.',
      },
    },
    required: ['issueKey', 'status'],
    additionalProperties: false,
  },
  annotations: { title: 'Mudar status', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async run(args, { jira, siteUrl }) {
    const issueKey = issueKeyArg(args, 'issueKey');
    const target = requiredText(args, 'status');

    const [issue, { transitions }] = await Promise.all([
      getIssue(jira, issueKey, 'summary,status'),
      jira.get<{ transitions: RawTransition[] }>(`rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`),
    ]);
    const current = issue.fields.status?.name ?? '?';
    const url = browseUrl(siteUrl, issueKey);
    if (normalize(current) === normalize(target)) {
      return textResult(`${issueKey} já está em "${current}".`, { issueKey, url, from: current, to: current, changed: false });
    }
    const wanted = normalize(target);
    const transition =
      transitions.find((option) => option.to && normalize(option.to.name) === wanted) ??
      transitions.find((option) => normalize(option.name) === wanted);
    if (!transition) {
      const options = transitions.map((option) => option.to?.name ?? option.name).filter((name, index, all) => all.indexOf(name) === index);
      throw new InputError(
        options.length
          ? `"${target}" não é alcançável a partir de "${current}". Status possíveis para ${issueKey}: ${options.join(', ')}.`
          : `Nenhuma transição disponível para ${issueKey} a partir de "${current}" (a conta pode não ter permissão).`,
      );
    }

    await jira.post(`rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, { transition: { id: transition.id } });
    const next = transition.to?.name ?? transition.name;
    return textResult(`${issueKey} (${issue.fields.summary ?? ''}): de "${current}" para "${next}".\n${url}`, {
      issueKey,
      url,
      from: current,
      to: next,
      changed: true,
    });
  },
};

export const TOOLS: Tool[] = [createSubtask, readStory, findIssues, readWorklogs, logWork, changeStatus];

export function toolDefinitions(): ToolDefinition[] {
  return TOOLS.map(({ run: _run, ...definition }) => definition);
}

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((tool) => tool.name === name);
}
