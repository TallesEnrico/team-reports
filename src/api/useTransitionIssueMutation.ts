import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { replaceCachedIssue, type CachedIssueList } from './issueListsCache';
import { isTokenRejected, isXsrfRejection, JiraApiError, jiraReason } from './jira-client';
import { JIRA_WRITE_PROXY_URL } from './jira-config';
import { fetchIssue, type IssueTransition, type JiraIssue, transitionIssue } from './jira-issues';
import { jiraKeys } from './queryKeys';

interface TransitionIssueVariables {
  issue: JiraIssue;
  transition: IssueTransition;
}

/** Motivo para a tela quando o Jira recusa a troca de status (vai depois de "Não foi possível mudar o status: "). */
export function describeTransitionError(error: Error): string {
  if (isTokenRejected(error)) return error.message;
  // A troca de status só existe como POST (`.../transitions`), que o Jira barra quando vem do navegador.
  if (error instanceof JiraApiError && isXsrfRejection(error)) {
    return JIRA_WRITE_PROXY_URL
      ? `o Jira recusou a troca mesmo pelo proxy de escritas (${JIRA_WRITE_PROXY_URL}).${jiraReason(error)}`
      : 'o Jira não aceita trocas de status feitas pelo navegador fora do site dele (proteção contra XSRF), e o proxy de escritas não está configurado (VITE_JIRA_WRITE_PROXY_URL). Por enquanto, troque o status no Jira.';
  }
  if (error instanceof JiraApiError && error.status === 403) {
    return `sua conta não tem permissão para mudar o status desta issue ("Transicionar itens").${jiraReason(error)}`;
  }
  return error.message;
}

/** Troca a issue nas listas de filhas em cache (a lista de subtarefas do modal da issue pai). */
function replaceInChildLists(queryClient: QueryClient, issue: JiraIssue) {
  queryClient.setQueriesData<JiraIssue[]>({ queryKey: jiraKeys.issueChildrenRoot() }, (children) =>
    children?.map((child) => (child.id === issue.id ? issue : child)),
  );
}

/**
 * Muda o status de uma issue (arrastar o card, o status do modal ou o de uma
 * subtarefa na lista da issue pai). Nas listas em cache (o quadro e as listas de
 * filhas) ela já aparece no status novo (otimista) e volta se o Jira recusar;
 * depois de aceita, é relida, porque a transição pode mudar outros campos
 * (resolução, responsável…).
 */
export function useTransitionIssueMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ issue, transition }: TransitionIssueVariables) => {
      await transitionIssue(issue.id, transition.id);
      return fetchIssue(issue.id);
    },
    onMutate: async ({ issue, transition }) => {
      const key = jiraKeys.issueLists();
      const childrenKey = jiraKeys.issueChildrenRoot();
      // Uma busca em andamento sobrescreveria a issue com o status antigo.
      await Promise.all([queryClient.cancelQueries({ queryKey: key }), queryClient.cancelQueries({ queryKey: childrenKey })]);
      const previous = queryClient.getQueriesData<CachedIssueList>({ queryKey: key });
      const previousChildren = queryClient.getQueriesData<JiraIssue[]>({ queryKey: childrenKey });
      const moved = { ...issue, status: transition.to };
      replaceCachedIssue(queryClient, moved);
      replaceInChildLists(queryClient, moved);
      return { previous, previousChildren };
    },
    onError: (error, _variables, context) => {
      for (const [queryKey, data] of context?.previous ?? []) queryClient.setQueryData(queryKey, data);
      for (const [queryKey, data] of context?.previousChildren ?? []) queryClient.setQueryData(queryKey, data);
      if (error instanceof JiraApiError && error.status === 401 && !isTokenRejected(error)) {
        queryClient.setQueryData(jiraKeys.writeAccess(), false);
      }
    },
    onSuccess: (updated) => {
      replaceInChildLists(queryClient, updated);
      // Fora das listas (ex: história pai): o status dela aparece nas subtarefas
      // (cabeçalho das raias do quadro), então as listas são buscadas de novo.
      if (!replaceCachedIssue(queryClient, updated)) {
        void queryClient.invalidateQueries({ queryKey: jiraKeys.issueLists() });
      }
      // O relatório mostra o status (em andamento); a próxima busca traz o novo.
      void queryClient.invalidateQueries({ queryKey: jiraKeys.worklogReports(), refetchType: 'none' });
    },
    onSettled: (_data, _error, { issue }) => {
      void queryClient.invalidateQueries({ queryKey: jiraKeys.issueTransitions(issue.id) });
      void queryClient.invalidateQueries({ queryKey: jiraKeys.issueDetails(issue.key) });
      // A subtarefa aparece com o status na lista do modal da issue pai.
      void queryClient.invalidateQueries({ queryKey: jiraKeys.issueChildrenRoot() });
    },
  });
}
