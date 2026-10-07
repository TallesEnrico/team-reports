import { ISSUE_FIELDS, type JiraIssue, type RawIssue, type RawIssueFields, toJiraIssue } from '../../../api/jira-issues';
import { searchIssues } from '../../../api/jira-search';

interface RawLoggableFields extends RawIssueFields {
  /** Subtarefas da issue: com alguma, as horas vão nelas. */
  subtasks?: unknown[];
}

const FIELDS = [...ISSUE_FIELDS, 'subtasks'];

/** Teto da lista (2 páginas da busca); acima disso ficam as atualizadas mais recentemente. */
export const ISSUES_TO_LOG_LIMIT = 200;

/** Só as tarefas da pessoa e ainda abertas: concluídas não recebem horas por aqui. */
const ASSIGNED_OPEN_JQL = 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC';

/** Issue pai (épico, ou com subtarefas): as horas vão nas filhas, como no modal da issue. */
function isParentIssue(raw: RawIssue<RawLoggableFields>): boolean {
  return (raw.fields.issuetype?.hierarchyLevel ?? 0) >= 1 || (raw.fields.subtasks?.length ?? 0) > 0;
}

/**
 * No formato das listas de issues em cache (`jiraKeys.issueLists`): trocar o
 * status (ou lançar horas) em qualquer tela atualiza a issue aqui também.
 */
export interface IssuesToLog {
  /** Na ordem do Jira: as atualizadas mais recentemente primeiro. */
  issues: JiraIssue[];
  /** Issues pai: ficam fora da lista (com o aviso de quantas), mas contam na pesquisa. */
  parentIds: string[];
  /** A pessoa tem mais tarefas abertas que o teto. */
  isTruncated: boolean;
}

/**
 * Tarefas abertas atribuídas à conta conectada, para escolher onde lançar
 * horas. A pesquisa (número, chave ou resumo) filtra esta lista no navegador
 * (`matchIssuesToLog`): o JQL não pesquisa parte da chave (ex: só "5151").
 */
export async function fetchIssuesToLog(signal?: AbortSignal): Promise<IssuesToLog> {
  const result = await searchIssues<RawLoggableFields>(ASSIGNED_OPEN_JQL, FIELDS, { signal, limit: ISSUES_TO_LOG_LIMIT });
  return {
    issues: result.issues.map(toJiraIssue),
    parentIds: result.issues.filter(isParentIssue).map((raw) => raw.id),
    isTruncated: result.isTruncated,
  };
}
