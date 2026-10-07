import type { IssueStatus, JiraIssue } from '../api/jira-issues';

/** O que a tela sabe de uma issue pai (o campo `parent` de uma issue, a raia do quadro, a linha do relatório). */
export interface ParentRef {
  id: string;
  key: string;
  summary: string;
  iconUrl?: string;
  status?: IssueStatus;
}

/**
 * Issue mínima para abrir o modal de uma issue que a tela só conhece por cima
 * (ex: a história pai); o modal busca os detalhes completos pela chave. Se ela
 * é um card do quadro, o Kanban abre o card (com o mesmo id) no lugar desta.
 */
export function parentToIssue(parent: ParentRef): JiraIssue {
  return {
    id: parent.id,
    key: parent.key,
    summary: parent.summary,
    status: parent.status ?? { id: '', name: '' },
    issueType: { id: '', name: '', iconUrl: parent.iconUrl, hierarchyLevel: 0 },
    timeSpentSeconds: 0,
  };
}
