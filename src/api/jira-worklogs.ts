import { type AdfNode, adfToPlainText, plainTextToAdf } from '../lib/adf';
import { requestJira } from './jira-client';
import { JIRA_WRITE_PROXY_URL } from './jira-config';
import { fetchCurrentUser, type RawJiraUser } from './jira-users';

export interface WorklogEntry {
  id: string;
  issueId: string;
  authorId: string;
  /** ISO 8601 com offset, como vem do Jira. */
  started: string;
  seconds: number;
  /** Descrição do apontamento em texto simples, uma linha por parágrafo ('' quando não há). */
  comment: string;
}

/** Apontamento como vem da API REST v3. */
export interface RawWorklog {
  id: string;
  issueId: string;
  author?: RawJiraUser;
  started: string;
  timeSpentSeconds: number;
  /** ADF na API v3. */
  comment?: AdfNode;
  /** Quando o apontamento foi criado (ISO 8601). */
  created?: string;
}

/** Início, duração e descrição de um apontamento novo ou alterado. */
export interface WorklogInput {
  started: Date;
  seconds: number;
  /** Na edição, só quando a descrição mudou: o Jira grava o texto simples no lugar do ADF original. */
  comment?: string;
}

interface WorklogPage {
  startAt: number;
  total: number;
  worklogs: RawWorklog[];
}

const WORKLOG_PAGE_SIZE = 1000;

export function toWorklogEntry(raw: RawWorklog): WorklogEntry {
  return {
    id: raw.id,
    issueId: raw.issueId,
    authorId: raw.author?.accountId ?? 'unknown',
    started: raw.started,
    seconds: raw.timeSpentSeconds,
    comment: raw.comment ? adfToPlainText(raw.comment) : '',
  };
}

/** Formato de data/hora que o Jira aceita em `started` (o `Z` do ISO não é aceito). */
function toJiraDateTime(date: Date): string {
  return date.toISOString().replace('Z', '+0000');
}

function toRequestBody(input: WorklogInput) {
  return {
    started: toJiraDateTime(input.started),
    timeSpentSeconds: input.seconds,
    ...(input.comment !== undefined && { comment: plainTextToAdf(input.comment) }),
  };
}

/** Todos os apontamentos de uma issue, opcionalmente só os iniciados na janela (ms desde a época). */
export async function fetchIssueWorklogs(
  issueId: string,
  window: { after?: number; before?: number } = {},
  signal?: AbortSignal,
): Promise<RawWorklog[]> {
  const worklogs: RawWorklog[] = [];
  for (let startAt = 0; ; ) {
    const page = await requestJira<WorklogPage>(`rest/api/3/issue/${issueId}/worklog`, {
      params: { startAt, maxResults: WORKLOG_PAGE_SIZE, startedAfter: window.after, startedBefore: window.before },
      signal,
    });
    worklogs.push(...page.worklogs);
    startAt += page.worklogs.length;
    if (page.worklogs.length === 0 || startAt >= page.total) return worklogs;
  }
}

/**
 * Altera um apontamento. Exige o escopo `write:jira-work` no token e permissão
 * no Jira para editar o apontamento (o próprio ou o de qualquer pessoa).
 */
export async function updateWorklog(worklog: WorklogEntry, input: WorklogInput): Promise<WorklogEntry> {
  const raw = await requestJira<RawWorklog>(`rest/api/3/issue/${worklog.issueId}/worklog/${worklog.id}`, {
    method: 'PUT',
    data: toRequestBody(input),
  });
  return { ...toWorklogEntry(raw), issueId: worklog.issueId, authorId: worklog.authorId };
}

/** Margem para achar o apontamento recém-criado pelo início (o Jira pode cortar os segundos). */
const CREATED_MATCH_MS = 60_000;

/**
 * O apontamento que a conta conectada acabou de criar: mesmo início e mesma
 * duração; entre iguais (ex: a mesma reunião lançada duas vezes), o mais novo.
 */
async function findCreatedWorklog(issueId: string, input: WorklogInput, seconds: number): Promise<RawWorklog> {
  const startedAt = input.started.getTime();
  const [me, worklogs] = await Promise.all([
    fetchCurrentUser(),
    fetchIssueWorklogs(issueId, { after: startedAt - CREATED_MATCH_MS, before: startedAt + CREATED_MATCH_MS }),
  ]);
  const candidates = worklogs.filter(
    (worklog) =>
      worklog.author?.accountId === me.accountId &&
      worklog.timeSpentSeconds === seconds &&
      Math.abs(Date.parse(worklog.started) - startedAt) < CREATED_MATCH_MS,
  );
  const newest = candidates.sort((a, b) => Date.parse(b.created ?? '') - Date.parse(a.created ?? ''))[0];
  if (!newest) {
    throw new Error('As horas foram lançadas, mas o apontamento não foi encontrado para salvar a descrição. Edite-o no Jira.');
  }
  return newest;
}

/**
 * Lança horas numa issue em nome da conta conectada (escopo `write:jira-work`).
 *
 * Com o proxy de escritas, `POST .../worklog`, numa chamada só. Sem ele, o POST
 * não funciona do navegador: o Jira Cloud recusa POST com User-Agent de
 * navegador vindo de outra origem ("XSRF check failed"), mesmo com
 * `X-Atlassian-Token: no-check`. PUT não passa por esse check: o apontamento
 * entra pela edição da issue (`update.worklog.add`, que não aceita descrição) e a
 * descrição vai depois, editando o apontamento criado.
 */
export async function createWorklog(issueId: string, input: WorklogInput): Promise<RawWorklog> {
  if (JIRA_WRITE_PROXY_URL) {
    const raw = await requestJira<RawWorklog>(`rest/api/3/issue/${issueId}/worklog`, {
      method: 'POST',
      data: toRequestBody(input),
    });
    return { ...raw, issueId };
  }

  // Em minutos, como o formulário (início e fim em HH:MM).
  const minutes = Math.max(1, Math.round(input.seconds / 60));
  await requestJira(`rest/api/3/issue/${issueId}`, {
    method: 'PUT',
    data: { update: { worklog: [{ add: { started: toJiraDateTime(input.started), timeSpent: `${minutes}m` } }] } },
  });

  const created = await findCreatedWorklog(issueId, input, minutes * 60);
  if (!input.comment) return { ...created, issueId };
  const raw = await requestJira<RawWorklog>(`rest/api/3/issue/${issueId}/worklog/${created.id}`, {
    method: 'PUT',
    data: { comment: plainTextToAdf(input.comment) },
  });
  return { ...raw, issueId };
}
