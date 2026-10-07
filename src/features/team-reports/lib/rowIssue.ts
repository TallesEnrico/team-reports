import type { JiraIssue } from '../../../api/jira-issues';
import { parentToIssue } from '../../../lib/parentIssue';
import type { ReportRow } from './buildReportTable';

/**
 * Issue que a chave da linha abre no modal: a da linha ou, agrupado por issue
 * pai, a pai do grupo. Só com o que o relatório tem; o modal busca o resto pela chave.
 */
export function rowIssue(row: ReportRow): JiraIssue | undefined {
  const { issue } = row;
  if (!issue) return row.parentIssue && parentToIssue(row.parentIssue);
  return {
    ...parentToIssue({ id: issue.id, key: issue.key, summary: issue.summary }),
    issueType: { id: '', name: issue.issueType?.name ?? '', iconUrl: issue.issueType?.iconUrl, hierarchyLevel: 0 },
    parent: issue.parent,
  };
}
