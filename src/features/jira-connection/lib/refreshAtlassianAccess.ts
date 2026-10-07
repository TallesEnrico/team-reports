import { readStoredJiraCredentials, useJiraConnectionStore, type JiraCredentials } from '@/store/useJiraConnectionStore';
import { clearOAuthPending, loadOAuthPending, saveOAuthPending, type OAuthPending } from '@/features/jira-connection/lib/oauthPending';

const REFRESH_PATH = '/auth/atlassian/refresh';
const REFRESH_LEAD_MS = 60_000;
const EXPIRY_SKEW_MS = 30_000;
const RETRY_MS = 30_000;
const LOCK_NAME = 'team-report:atlassian-refresh';

export type AtlassianAccess = 'ready' | 'rejected' | 'unavailable';

interface OAuthTokenGrant {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class RefreshRejectedError extends Error {
  constructor() {
    super('O acesso da Atlassian expirou ou foi revogado.');
    this.name = 'RefreshRejectedError';
  }
}

let inflight: { force: boolean; task: Promise<AtlassianAccess> } | null = null;

export function oauthExpiresAt(expiresInSeconds: number): number {
  return Date.now() + expiresInSeconds * 1000 - EXPIRY_SKEW_MS;
}

export async function exchangeRefreshToken(refreshToken: string): Promise<OAuthTokenGrant> {
  let response: Response;
  try {
    response = await fetch(REFRESH_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    throw new Error('Não foi possível renovar o acesso da Atlassian.');
  }
  if (response.status === 401 || response.status === 403) throw new RefreshRejectedError();
  if (!response.ok) throw new Error('Não foi possível renovar o acesso da Atlassian.');
  let body: { accessToken?: unknown; refreshToken?: unknown; expiresIn?: unknown };
  try {
    body = (await response.json()) as { accessToken?: unknown; refreshToken?: unknown; expiresIn?: unknown };
  } catch {
    throw new Error('Não foi possível renovar o acesso da Atlassian.');
  }
  if (typeof body.accessToken !== 'string' || typeof body.refreshToken !== 'string' || typeof body.expiresIn !== 'number') {
    throw new Error('A Atlassian não devolveu o acesso do Jira.');
  }
  return { accessToken: body.accessToken, refreshToken: body.refreshToken, expiresIn: body.expiresIn };
}

export function ensureAtlassianAccess(rejectedToken?: string): Promise<AtlassianAccess> {
  const force = typeof rejectedToken === 'string';
  const current = useJiraConnectionStore.getState();
  const credentials = current.credentials;
  if (!force && !current.tokenRejected) {
    if (!credentials || credentials.authMethod !== 'oauth') return Promise.resolve('ready');
    const stillValid = typeof credentials.expiresAt === 'number' && credentials.expiresAt > Date.now();
    if (stillValid && (!credentials.refreshToken || accessWithinLead(credentials))) return Promise.resolve('ready');
  }
  if (inflight && (inflight.force || !force)) return inflight.task;
  const task = runEnsure(rejectedToken).finally(() => {
    if (inflight?.task === task) inflight = null;
  });
  inflight = { force, task };
  return task;
}

export function watchAtlassianAccess(): () => void {
  let stopped = false;
  let timer = 0;

  const schedule = () => {
    window.clearTimeout(timer);
    if (stopped) return;
    const credentials = useJiraConnectionStore.getState().credentials;
    if (credentials?.authMethod !== 'oauth' || !credentials.refreshToken || typeof credentials.expiresAt !== 'number') return;
    const delay = Math.max(1_000, credentials.expiresAt - Date.now() - REFRESH_LEAD_MS);
    timer = window.setTimeout(() => void tick(), delay);
  };

  const tick = async () => {
    if (stopped) return;
    const outcome = await ensureAtlassianAccess();
    if (stopped) return;
    if (outcome === 'rejected') {
      useJiraConnectionStore.getState().markTokenRejected();
      return;
    }
    if (outcome === 'unavailable') {
      timer = window.setTimeout(() => void tick(), RETRY_MS);
      return;
    }
    schedule();
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') void tick();
  };

  void tick();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

export async function loadUsableOAuthPending(): Promise<OAuthPending | null> {
  const pending = await loadOAuthPending();
  if (!pending) return null;
  if (pending.expiresAt - Date.now() > REFRESH_LEAD_MS) return pending;
  if (!pending.refreshToken) {
    await clearOAuthPending();
    return null;
  }
  try {
    const grant = await exchangeRefreshToken(pending.refreshToken);
    const next = {
      ...pending,
      accessToken: grant.accessToken,
      refreshToken: grant.refreshToken,
      expiresAt: oauthExpiresAt(grant.expiresIn),
    };
    await saveOAuthPending(next);
    return next;
  } catch (error) {
    if (error instanceof RefreshRejectedError) await clearOAuthPending();
    return null;
  }
}

function accessWithinLead(credentials: JiraCredentials): boolean {
  return typeof credentials.expiresAt === 'number' && credentials.expiresAt - Date.now() > REFRESH_LEAD_MS;
}

function newerCredentials(left: JiraCredentials | null, right: JiraCredentials | null): JiraCredentials | null {
  if (!left) return right;
  if (!right) return left;
  return (left.expiresAt ?? 0) >= (right.expiresAt ?? 0) ? left : right;
}

function adoptCredentials(credentials: JiraCredentials): void {
  const state = useJiraConnectionStore.getState();
  const current = state.credentials;
  if (
    current &&
    current.token === credentials.token &&
    current.refreshToken === credentials.refreshToken &&
    current.expiresAt === credentials.expiresAt
  ) {
    return;
  }
  const accessUsable = typeof credentials.expiresAt === 'number' && credentials.expiresAt > Date.now();
  useJiraConnectionStore.setState({
    credentials,
    status: 'connected',
    tokenRejected: current?.token !== credentials.token && accessUsable ? false : state.tokenRejected,
  });
}

async function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = navigator.locks;
  if (!locks) return task();
  return locks.request(LOCK_NAME, task);
}

async function runEnsure(rejectedToken?: string): Promise<AtlassianAccess> {
  return withRefreshLock(async () => {
    const latest = newerCredentials(useJiraConnectionStore.getState().credentials, await readStoredJiraCredentials());
    if (latest) adoptCredentials(latest);
    if (!latest || latest.authMethod !== 'oauth') return 'ready';
    const rejected = typeof rejectedToken === 'string' && latest.token === rejectedToken;
    const blocked = useJiraConnectionStore.getState().tokenRejected;
    if (!rejected && !blocked && accessWithinLead(latest)) return 'ready';
    if (!latest.refreshToken) {
      if (blocked) return 'rejected';
      return typeof latest.expiresAt === 'number' && latest.expiresAt > Date.now() ? 'ready' : 'rejected';
    }
    if (blocked && !rejected) return 'rejected';
    try {
      const grant = await exchangeRefreshToken(latest.refreshToken);
      await useJiraConnectionStore.getState().replaceOAuthTokens({
        token: grant.accessToken,
        refreshToken: grant.refreshToken,
        expiresAt: oauthExpiresAt(grant.expiresIn),
      });
      return 'ready';
    } catch (error) {
      if (!(error instanceof RefreshRejectedError)) return 'unavailable';
      const again = await readStoredJiraCredentials();
      if (
        again?.authMethod === 'oauth' &&
        again.token !== latest.token &&
        again.refreshToken &&
        again.refreshToken !== latest.refreshToken &&
        accessWithinLead(again)
      ) {
        adoptCredentials(again);
        return 'ready';
      }
      return 'rejected';
    }
  });
}
