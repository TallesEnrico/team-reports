import { jiraKeys } from '../../../api/queryKeys';
import type { IssuesQuery, WorklogsQuery } from './builder-api';

/** Os projetos em ordem: a mesma escolha em outra ordem reaproveita o cache. */
function sorted(projectKeys: string[]): string[] {
  return [...projectKeys].sort();
}

export const builderKeys = {
  /**
   * Horas lançadas ficam entre os relatórios de horas (`jiraKeys.worklogReports`):
   * lançar horas em qualquer tela busca de novo as peças na tela.
   */
  worklogsRoot: () => [...jiraKeys.worklogReports(), 'builder'] as const,
  worklogs: (query: WorklogsQuery) => [...builderKeys.worklogsRoot(), { ...query, projectKeys: sorted(query.projectKeys) }] as const,
  issuesRoot: () => ['jira', 'builder-issues'] as const,
  issues: (query: IssuesQuery) => [...builderKeys.issuesRoot(), { ...query, projectKeys: sorted(query.projectKeys) }] as const,
};
