import { addDays } from '../../../lib/dates';
import type { Principal, ReportFilters } from '../types';

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function principalToJql(principal: Principal): string {
  switch (principal.type) {
    case 'current-user':
      return 'currentUser()';
    case 'user':
      return quote(principal.accountId);
    case 'group':
      return `membersOf(${quote(principal.name)})`;
  }
}

/** Remove um ORDER BY do JQL livre, já que ele é combinado com outros filtros. */
function stripOrderBy(jql: string): string {
  return jql.replace(/\border\s+by\b[\s\S]*$/i, '').trim();
}

function sharedClauses(filters: Pick<ReportFilters, 'projectKeys' | 'principals' | 'jql'>, peopleField: 'worklogAuthor' | 'assignee'): string[] {
  const clauses: string[] = [];
  if (filters.projectKeys.length > 0) {
    clauses.push(`project in (${filters.projectKeys.map(quote).join(', ')})`);
  }
  if (filters.principals.length > 0) {
    clauses.push(`${peopleField} in (${filters.principals.map(principalToJql).join(', ')})`);
  }
  const customJql = stripOrderBy(filters.jql);
  if (customJql) clauses.push(`(${customJql})`);
  return clauses;
}

/**
 * JQL das issues com apontamento no período. O intervalo de `worklogDate` é
 * ampliado em um dia para cada lado porque o Jira avalia a data no fuso do dono
 * do token; o recorte exato é feito no cliente, no fuso escolhido no relatório.
 */
export function buildReportJql(filters: Pick<ReportFilters, 'from' | 'to' | 'projectKeys' | 'principals' | 'jql'>): string {
  const clauses = [
    `worklogDate >= ${quote(addDays(filters.from, -1))}`,
    `worklogDate <= ${quote(addDays(filters.to, 1))}`,
    ...sharedClauses(filters, 'worklogAuthor'),
  ];
  return clauses.join(' AND ');
}

/**
 * Issues em andamento das pessoas do filtro, nos mesmos projetos e JQL.
 * Entram na tabela mesmo sem apontamento no período.
 */
export function buildInProgressJql(filters: Pick<ReportFilters, 'projectKeys' | 'principals' | 'jql'>): string {
  return [`statusCategory = "In Progress"`, ...sharedClauses(filters, 'assignee')].join(' AND ');
}
