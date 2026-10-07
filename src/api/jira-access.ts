import { isTokenRejected, JiraApiError, requestJira } from './jira-client';

/**
 * Se o token conectado pode escrever no Jira (escopo `write:jira-work`: editar
 * e lançar horas, mover issues de status). Não há endpoint que liste os escopos
 * de um token de API, então testa uma escrita que não altera nada: o PUT de um
 * apontamento que não existe. Sem o escopo, o gateway barra com 401/403 antes de
 * chegar ao Jira; com ele, o Jira responde 404.
 */
/** O que a conta conectada pode fazer numa issue (permissões do projeto). */
export interface IssuePermissions {
  /** Editar título, descrição e outros campos ("Editar itens"). */
  edit: boolean;
  /** Trocar o responsável ("Atribuir itens"). */
  assign: boolean;
  /** Trocar o relator ("Modificar relator"). */
  modifyReporter: boolean;
  /** Criar issues no projeto, inclusive subtarefas ("Criar itens"). */
  create: boolean;
}

const PERMISSION_KEYS = {
  edit: 'EDIT_ISSUES',
  assign: 'ASSIGN_ISSUES',
  modifyReporter: 'MODIFY_REPORTER',
  create: 'CREATE_ISSUES',
} as const;

export async function fetchIssuePermissions(issueKey: string, signal?: AbortSignal): Promise<IssuePermissions> {
  const data = await requestJira<{ permissions: Record<string, { havePermission?: boolean }> }>(
    'rest/api/3/mypermissions',
    { params: { issueKey, permissions: Object.values(PERMISSION_KEYS).join(',') }, signal },
  );
  const has = (key: string) => data.permissions[key]?.havePermission === true;
  return {
    edit: has(PERMISSION_KEYS.edit),
    assign: has(PERMISSION_KEYS.assign),
    modifyReporter: has(PERMISSION_KEYS.modifyReporter),
    create: has(PERMISSION_KEYS.create),
  };
}

export async function fetchHasWriteAccess(signal?: AbortSignal): Promise<boolean> {
  try {
    await requestJira('rest/api/3/issue/0/worklog/0', { method: 'PUT', data: {}, signal, remember: false });
    return true;
  } catch (error) {
    // Sem rede, ou token que não vale mais: não dá para saber do escopo (e nada fica em cache como "sem escrita").
    if (!(error instanceof JiraApiError) || error.status === 0 || isTokenRejected(error)) throw error;
    return error.status !== 401 && error.status !== 403;
  }
}
