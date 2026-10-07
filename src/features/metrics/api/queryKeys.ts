import { jiraKeys } from '../../../api/queryKeys';
import type { MonthKey } from '../types';

/** As squads em ordem: a mesma escolha em outra ordem reaproveita o cache. */
function sorted(projectKeys: string[]): string[] {
  return [...projectKeys].sort();
}

/**
 * Os meses ficam entre os relatórios de horas (`jiraKeys.worklogReports`): lançar
 * horas em qualquer tela busca de novo os meses na tela, e editar um apontamento
 * no Reports troca ele aqui também.
 */
export const metricsKeys = {
  root: () => [...jiraKeys.worklogReports(), 'metrics'] as const,
  squadMonth: (month: MonthKey, projectKeys: string[]) =>
    [...metricsKeys.root(), 'squad', { month, projectKeys: sorted(projectKeys) }] as const,
  otherProjectsMonth: (month: MonthKey, projectKeys: string[], accountIds: string[]) =>
    [...metricsKeys.root(), 'other-projects', { month, projectKeys: sorted(projectKeys), accountIds }] as const,
};
