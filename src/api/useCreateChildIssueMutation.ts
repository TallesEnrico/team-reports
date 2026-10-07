import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isTokenRejected, isXsrfRejection, JiraApiError, jiraReason } from './jira-client';
import { JIRA_WRITE_PROXY_URL } from './jira-config';
import { createChildIssue, createIssue, type NewChildIssue } from './jira-issues';
import { jiraKeys } from './queryKeys';

interface CreateChildIssueVariables {
  parentKey: string;
  input: NewChildIssue;
}

/** Mensagem para o formulário quando o Jira recusa a criação; leva o motivo que o Jira deu. */
export function describeCreateIssueError(error: Error): string {
  if (!(error instanceof JiraApiError)) return error.message;
  // Criar issue só existe como POST, que o Jira barra quando vem do navegador (sem o proxy de escritas).
  if (isXsrfRejection(error)) {
    return JIRA_WRITE_PROXY_URL
      ? `O Jira recusou a criação mesmo pelo proxy de escritas (${JIRA_WRITE_PROXY_URL}).${jiraReason(error)}`
      : 'O Jira não aceita criar issues feitas pelo navegador fora do site dele (proteção contra XSRF), e o proxy de escritas não está configurado (VITE_JIRA_WRITE_PROXY_URL). Por enquanto, crie no Jira.';
  }
  if (isTokenRejected(error)) return error.message;
  if (error.status === 401) {
    return `O Jira recusou a criação: o token não tem o escopo write:jira-work. Crie um token novo com ele, clique em "Sair" e conecte com o token novo.${jiraReason(error)}`;
  }
  if (error.status === 403) {
    return `O Jira recusou a criação: sua conta precisa da permissão "Criar itens" (Create issues) no projeto.${jiraReason(error)}`;
  }
  // 400: ex: um campo obrigatório no projeto que o formulário não tem.
  return `O Jira recusou a criação: ${error.details.join(' ') || error.message}`;
}

function onCreateError(queryClient: ReturnType<typeof useQueryClient>, error: Error) {
  if (error instanceof JiraApiError && error.status === 401 && !isTokenRejected(error)) {
    queryClient.setQueryData(jiraKeys.writeAccess(), false);
  }
}

/** Cria uma filha da issue (subtarefa, ou issue do épico) e atualiza a lista de filhas e os quadros. */
export function useCreateChildIssueMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ parentKey, input }: CreateChildIssueVariables) => createChildIssue(parentKey, input),
    onSuccess: (_created, { parentKey }) => {
      void queryClient.invalidateQueries({ queryKey: jiraKeys.issueChildren(parentKey) });
      // A filha nova pode ser card de um quadro em cache (se for de alguém escolhido lá).
      void queryClient.invalidateQueries({ queryKey: jiraKeys.issueLists() });
    },
    onError: (error) => onCreateError(queryClient, error),
  });
}

interface CreateIssueVariables {
  projectKey: string;
  input: NewChildIssue;
  /** Épico da história, quando a tela de criação pede o pai. */
  parentKey?: string;
}

/** Cria uma issue no projeto (história, sem ser filha) e atualiza os quadros em cache. */
export function useCreateIssueMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectKey, input, parentKey }: CreateIssueVariables) => createIssue(projectKey, input, parentKey),
    onSuccess: (_created, { parentKey }) => {
      if (parentKey) void queryClient.invalidateQueries({ queryKey: jiraKeys.issueChildren(parentKey) });
      void queryClient.invalidateQueries({ queryKey: jiraKeys.issueLists() });
    },
    onError: (error) => onCreateError(queryClient, error),
  });
}
