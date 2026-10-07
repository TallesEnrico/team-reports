import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isCachedIssue, replaceCachedIssue } from './issueListsCache';
import { isTokenRejected, JiraApiError, jiraReason } from './jira-client';
import { JIRA_WRITE_PROXY_URL } from './jira-config';
import { fetchIssue } from './jira-issues';
import { createWorklog, type WorklogInput } from './jira-worklogs';
import { jiraKeys } from './queryKeys';

interface LogWorkVariables {
  issue: { id: string; key: string };
  input: WorklogInput;
}

/**
 * Mensagem para o formulário quando o Jira recusa o lançamento. 401 vem do
 * gateway (token sem o escopo); 403, do Jira (a conta não pode lançar horas na
 * issue; sem o proxy de escritas, também editá-la); 400 sobre `worklog`, da
 * configuração do projeto (sem o proxy, o lançamento entra pela edição da issue:
 * ver `createWorklog`). Todas levam o motivo que o Jira deu.
 */
export function describeLogWorkError(error: Error): string {
  if (!(error instanceof JiraApiError) || isTokenRejected(error)) return error.message;
  if (error.status === 401) {
    return `O Jira recusou o lançamento: o token não tem o escopo write:jira-work. Crie um token novo com ele, clique em "Sair" e conecte com o token novo.${jiraReason(error)}`;
  }
  if (error.status === 403) {
    const permissions = JIRA_WRITE_PROXY_URL
      ? 'da permissão "Trabalhar em itens" (Work on issues)'
      : 'das permissões "Editar itens" (Edit issues) e "Trabalhar em itens" (Work on issues)';
    return `O Jira recusou o lançamento: sua conta precisa ${permissions} no projeto, e o status da issue não pode bloquear alterações.${jiraReason(error)}`;
  }
  if (!JIRA_WRITE_PROXY_URL && error.status === 400 && error.details.some((message) => /worklog/i.test(message))) {
    return `O Jira não aceitou o lançamento por aqui: o campo "Registrar trabalho" (Log Work) precisa estar na tela de edição das issues do projeto. Peça a quem administra o Jira para incluí-lo.${jiraReason(error)}`;
  }
  return error.message;
}

/** Lança horas numa issue e atualiza o modal, os cards em cache e os relatórios de horas. */
export function useLogWorkMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ issue, input }: LogWorkVariables) => createWorklog(issue.id, input),
    onSuccess: async (_worklog, { issue }) => {
      void queryClient.invalidateQueries({ queryKey: jiraKeys.issueWorklogs(issue.id) });
      void queryClient.invalidateQueries({ queryKey: jiraKeys.issueDetails(issue.key) });
      // O relatório na tela busca de novo (as horas novas aparecem); os demais ficam desatualizados.
      void queryClient.invalidateQueries({ queryKey: jiraKeys.worklogReports() });
      // O tempo lançado aparece no card, se a issue está em algum quadro em cache.
      if (!isCachedIssue(queryClient, issue.id)) return;
      try {
        replaceCachedIssue(queryClient, await fetchIssue(issue.id));
      } catch {
        // O card mostra o tempo antigo até a próxima atualização do quadro.
      }
    },
    onError: (error) => {
      if (error instanceof JiraApiError && error.status === 401 && !isTokenRejected(error)) {
        queryClient.setQueryData(jiraKeys.writeAccess(), false);
      }
    },
  });
}
