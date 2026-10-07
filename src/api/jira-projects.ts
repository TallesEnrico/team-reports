import { requestJira } from './jira-client';

/** Projeto do Jira; no app, cada squad é um projeto. */
export interface JiraProject {
  id: string;
  key: string;
  name: string;
}

interface ProjectPage {
  isLast: boolean;
  values: JiraProject[];
}

const PAGE_SIZE = 100;

/** Projetos visíveis para a conta, por nome. */
export async function fetchProjects(signal?: AbortSignal): Promise<JiraProject[]> {
  const projects: JiraProject[] = [];
  for (let startAt = 0; ; startAt += PAGE_SIZE) {
    const page = await requestJira<ProjectPage>('rest/api/3/project/search', {
      params: { startAt, maxResults: PAGE_SIZE, orderBy: 'name' },
      signal,
    });
    projects.push(...page.values.map(({ id, key, name }) => ({ id, key, name: name.trim() })));
    if (page.isLast || page.values.length === 0) return projects;
  }
}
