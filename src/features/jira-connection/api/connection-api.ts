import { type JiraAuth, requestJira } from '../../../api/jira-client';

export interface ConnectedUser {
  accountId: string;
  displayName: string;
}

export interface Squad {
  key: string;
  name: string;
}

interface ProjectPage {
  isLast: boolean;
  values: Squad[];
}

export interface JiraSignIn extends JiraAuth {
  cloudId: string;
}

/** Confirma que e-mail + token autenticam no Jira (401 se não conferem). */
export async function verifyJiraCredentials({ cloudId, ...auth }: JiraSignIn): Promise<ConnectedUser> {
  const user = await requestJira<{ accountId: string; displayName?: string }>('rest/api/3/myself', { auth, cloudId });
  return { accountId: user.accountId, displayName: user.displayName ?? auth.email };
}

/** Squads = projetos do Jira visíveis para a conta. */
export async function fetchSquads({ cloudId, ...auth }: JiraSignIn, signal?: AbortSignal): Promise<Squad[]> {
  const squads: Squad[] = [];
  for (let startAt = 0; ; startAt += 100) {
    const page = await requestJira<ProjectPage>('rest/api/3/project/search', {
      params: { startAt, maxResults: 100, orderBy: 'name' },
      signal,
      auth,
      cloudId,
    });
    squads.push(...page.values.map(({ key, name }) => ({ key, name: name.trim() })));
    if (page.isLast || page.values.length === 0) return squads;
  }
}
