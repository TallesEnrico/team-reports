import { addDays, todayKey } from '../lib/dates';
import { JiraApiError, requestJira } from './jira-client';
import { searchIssues } from './jira-search';

export interface JiraUser {
  accountId: string;
  displayName: string;
  avatarUrl?: string;
  timeZone?: string;
  /** `false`: conta desativada no Jira (não lança mais horas). */
  active?: boolean;
}

/** Usuário como vem da API REST v3. */
export interface RawJiraUser {
  accountId: string;
  accountType?: string;
  displayName?: string;
  active?: boolean;
  timeZone?: string;
  avatarUrls?: Record<string, string>;
}

export function toJiraUser(raw: RawJiraUser): JiraUser {
  return {
    accountId: raw.accountId,
    displayName: raw.displayName ?? raw.accountId,
    avatarUrl: raw.avatarUrls?.['24x24'],
    timeZone: raw.timeZone,
    active: raw.active,
  };
}

export function fetchCurrentUser(signal?: AbortSignal): Promise<JiraUser> {
  return requestJira<RawJiraUser>('rest/api/3/myself', { signal }).then(toJiraUser);
}

/** Uma conta conferida pelo accountId (as conexões entre dispositivos conferem quem está na sala). */
export interface JiraAccount extends JiraUser {
  /** `atlassian` é uma pessoa; `app` e `customer` não. */
  accountType?: string;
  /** Só vem quando a privacidade do perfil deixa. */
  emailAddress?: string;
}

/**
 * Uma conta deste site do Jira pelo accountId; `null` se ela não existe.
 * Pede a permissão "Navegar por usuários e grupos" (sem ela, o Jira responde 403).
 */
export async function fetchAccount(accountId: string, signal?: AbortSignal): Promise<JiraAccount | null> {
  try {
    const raw = await requestJira<RawJiraUser & { emailAddress?: string }>('rest/api/3/user', { params: { accountId }, signal });
    return {
      ...toJiraUser(raw),
      avatarUrl: raw.avatarUrls?.['48x48'] ?? raw.avatarUrls?.['24x24'],
      accountType: raw.accountType,
      emailAddress: raw.emailAddress,
    };
  } catch (error) {
    // 404: não existe; 400: nem é um accountId.
    if (error instanceof JiraApiError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
}

const memberCollator = new Intl.Collator('pt-BR');

/**
 * Pessoas da squad: quem pode ser responsável por issues no projeto (o mesmo
 * critério do campo Responsável do Jira). Os papéis do projeto pediriam
 * permissão de administrador. O Jira só varre os primeiros 1000 usuários do site.
 */
export async function fetchSquadMembers(projectKey: string, signal?: AbortSignal): Promise<JiraUser[]> {
  const users = await requestJira<RawJiraUser[]>('rest/api/3/user/assignable/search', {
    params: { project: projectKey, maxResults: 1000 },
    signal,
  });
  return users
    .filter((user) => user.accountType === 'atlassian' && user.active !== false)
    .map(toJiraUser)
    .sort((a, b) => memberCollator.compare(a.displayName, b.displayName));
}

export async function fetchRecentSquadAuthors(projectKey: string, signal?: AbortSignal): Promise<JiraUser[]> {
  const from = addDays(todayKey(), -60);
  const key = projectKey.replace(/["\\]/g, '');
  const result = await searchIssues<{ worklog?: { worklogs?: { author?: RawJiraUser }[] } }>(
    `project = "${key}" AND worklogDate >= "${from}"`,
    ['worklog'],
    { signal, limit: 80 },
  );
  const byId = new Map<string, JiraUser>();
  for (const issue of result.issues) {
    for (const worklog of issue.fields.worklog?.worklogs ?? []) {
      const author = worklog.author;
      if (!author?.accountId || author.accountType === 'app' || author.accountType === 'customer' || author.active === false) continue;
      if (!byId.has(author.accountId)) byId.set(author.accountId, toJiraUser(author));
    }
  }
  return [...byId.values()].sort((a, b) => memberCollator.compare(a.displayName, b.displayName));
}

/** Onde a pessoa pode ser responsável: numa issue que existe ou num projeto (issue nova). */
export type AssignableScope = { issueKey: string } | { projectKey: string };

/** Quem pode ser responsável pela issue (ou no projeto), pelo nome; sem busca, os primeiros da lista. */
export async function searchAssignableUsers(
  scope: AssignableScope,
  query: string,
  signal?: AbortSignal,
): Promise<JiraUser[]> {
  const users = await requestJira<RawJiraUser[]>('rest/api/3/user/assignable/search', {
    params: {
      ...('issueKey' in scope ? { issueKey: scope.issueKey } : { project: scope.projectKey }),
      query: query || undefined,
      maxResults: 50,
    },
    signal,
  });
  return users.filter((user) => user.accountType === 'atlassian' && user.active !== false).map(toJiraUser);
}

/** Pessoas do Jira pelo nome ou e-mail, sem contas de app/cliente do Service Management nem contas desativadas. */
export async function searchUsers(query: string, signal?: AbortSignal): Promise<JiraUser[]> {
  const users = await requestJira<RawJiraUser[]>('rest/api/3/user/search', { params: { query, maxResults: 20 }, signal });
  return users.filter((user) => user.accountType === 'atlassian' && user.active !== false).map(toJiraUser);
}

/** Usuários por página em `users/search`; o Jira pode devolver menos que isso. */
const USERS_PAGE_SIZE = 1000;
/** Trava contra paginação sem fim. */
const MAX_USERS = 20_000;

/**
 * Todas as pessoas do Jira (contas de pessoas ativas), por nome. Pede a permissão
 * "Navegar por usuários e grupos" no site.
 */
export async function fetchAllUsers(signal?: AbortSignal): Promise<JiraUser[]> {
  const users: RawJiraUser[] = [];
  // Segue até uma página vazia: uma página menor que o pedido não quer dizer que acabou.
  while (users.length < MAX_USERS) {
    const page = await requestJira<RawJiraUser[]>('rest/api/3/users/search', {
      params: { startAt: users.length, maxResults: USERS_PAGE_SIZE },
      signal,
    });
    if (page.length === 0) break;
    users.push(...page);
  }
  return users
    .filter((user) => user.accountType === 'atlassian' && user.active !== false)
    .map(toJiraUser)
    .sort((a, b) => memberCollator.compare(a.displayName, b.displayName));
}
