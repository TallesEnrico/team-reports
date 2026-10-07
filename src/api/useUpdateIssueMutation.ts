import { useMutation, useQueryClient } from '@tanstack/react-query';
import { replaceCachedIssue } from './issueListsCache';
import { isTokenRejected, JiraApiError, jiraReason } from './jira-client';
import { fetchIssueDetails, type IssueChanges, type JiraIssue, toBaseIssue, updateIssue } from './jira-issues';
import { jiraKeys } from './queryKeys';

interface UpdateIssueVariables {
  issue: Pick<JiraIssue, 'id' | 'key'>;
  changes: IssueChanges;
}

/** Campo editado, para a mensagem de erro dizer a permissão certa. */
export type EditedField = 'summary' | 'description' | 'assignee' | 'reporter';

const FIELD_PERMISSION: Record<EditedField, string> = {
  summary: '"Editar itens" (Edit issues)',
  description: '"Editar itens" (Edit issues)',
  assignee: '"Atribuir itens" (Assign issues)',
  reporter: '"Modificar relator" (Modify reporter)',
};

/** Mensagem para o campo quando o Jira recusa a edição; leva o motivo que o Jira deu. */
export function describeIssueEditError(error: Error, field: EditedField): string {
  if (!(error instanceof JiraApiError) || isTokenRejected(error)) return error.message;
  if (error.status === 401) {
    return `O Jira recusou a alteração: o token não tem o escopo write:jira-work. Crie um token novo com ele, clique em "Sair" e conecte com o token novo.${jiraReason(error)}`;
  }
  if (error.status === 403) {
    return `O Jira recusou a alteração: sua conta precisa da permissão ${FIELD_PERMISSION[field]} no projeto.${jiraReason(error)}`;
  }
  // 400: ex: o campo não está na tela de edição do projeto, ou o valor não é aceito.
  return `O Jira recusou a alteração: ${error.details.join(' ') || error.message}`;
}

/**
 * Edita título, descrição, responsável ou relator. Depois de aceita, relê a
 * issue: o modal mostra o que o Jira gravou, e o card muda nos quadros em cache.
 */
export function useUpdateIssueMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ issue, changes }: UpdateIssueVariables) => {
      await updateIssue(issue.id, changes);
      return fetchIssueDetails(issue.key);
    },
    onSuccess: (details) => {
      queryClient.setQueryData(jiraKeys.issueDetails(details.key), details);
      replaceCachedIssue(queryClient, toBaseIssue(details));
      // O título e o responsável aparecem na lista de filhas da issue pai.
      void queryClient.invalidateQueries({ queryKey: jiraKeys.issueChildrenRoot() });
      // O relatório e o Metrics mostram o título: a próxima busca traz o novo.
      void queryClient.invalidateQueries({ queryKey: jiraKeys.worklogReports(), refetchType: 'none' });
    },
    onError: (error) => {
      if (error instanceof JiraApiError && error.status === 401 && !isTokenRejected(error)) {
        queryClient.setQueryData(jiraKeys.writeAccess(), false);
      }
    },
  });
}
