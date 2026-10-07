import { jiraKeys } from '../../../api/queryKeys';
import type { ReportFilters } from '../types';

export const teamReportKeys = {
  fields: () => ['jira', 'fields'] as const,
  userGroupSearch: (query: string) => ['jira', 'user-group-search', { query }] as const,
  /**
   * Tarefas abertas da conta conectada (a pesquisa do "Lançar horas" filtra no
   * navegador). Entre as listas de issues: trocar o status atualiza a lista.
   */
  issuesToLog: () => [...jiraKeys.issueLists(), 'issues-to-log'] as const,
  /** Prefixo de todas as queries de relatório (para invalidar/observar). */
  worklogReportRoot: () => jiraKeys.worklogReports(),
  worklogReport: (filters: ReportFilters | null, accountId: string | undefined) =>
    [...jiraKeys.worklogReports(), filters && { ...filters, accountId }] as const,
};
