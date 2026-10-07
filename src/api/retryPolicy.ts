import { JiraApiError } from './jira-client';

/** Não repete erros de cliente (JQL inválida, credencial errada); repete falhas de rede/5xx até 2 vezes. */
export function retryUnlessClientError(failureCount: number, error: Error): boolean {
  if (error instanceof JiraApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}
