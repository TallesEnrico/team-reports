/** Chaves de cache compartilhadas entre as telas. */
export const jiraKeys = {
  currentUser: () => ['jira', 'current-user'] as const,
  /** Domínio do site (`DOMINIO.atlassian.net`), para o logo do Jira. */
  siteDomain: () => ['jira', 'site-domain'] as const,
  projects: () => ['jira', 'projects'] as const,
  /** Quem pode ser responsável na squad (projeto). */
  squadMembers: (projectKey: string) => ['jira', 'squad-members', { projectKey }] as const,
  squadAuthors: (projectKey: string) => ['jira', 'squad-authors', { projectKey }] as const,
  /** Pessoas para escolher num campo (responsável, relator), pela busca digitada. */
  userOptions: (source: unknown, query: string) => ['jira', 'user-options', { source, query }] as const,
  /** O que a conta pode fazer na issue (editar, atribuir, trocar relator, criar). */
  issuePermissions: (issueKey: string) => ['jira', 'issue-permissions', { issueKey }] as const,
  /** Tipos de issue que a conta pode criar no projeto. */
  creatableIssueTypes: (projectKey: string) => ['jira', 'creatable-issue-types', { projectKey }] as const,
  /** Campos da tela de criação do projeto para um tipo de issue, com as opções (ex: tipo de atividade). */
  createFields: (projectKey: string, issueTypeId: string) => ['jira', 'create-fields', { projectKey, issueTypeId }] as const,
  /** Épicos abertos da squad, pela busca digitada (vazio: os atualizados por último). */
  epicOptions: (projectKey: string, query: string) => ['jira', 'epic-options', { projectKey, query }] as const,
  /** Uma conta pelo accountId (`null` se não existe no site). */
  account: (accountId: string) => ['jira', 'account', { accountId }] as const,
  /** Todas as pessoas do Jira (contas de pessoas ativas). */
  allUsers: () => ['jira', 'all-users'] as const,
  writeAccess: () => ['jira', 'write-access'] as const,
  /**
   * Prefixo dos relatórios de horas. Quem lança ou altera horas em outra tela
   * marca os relatórios em cache como desatualizados.
   */
  worklogReports: () => ['worklog-report'] as const,
  /**
   * Apontamentos da conta conectada num dia (a linha do tempo do "Lançar horas").
   * Entre os relatórios de horas: lançar horas em qualquer tela busca de novo.
   */
  myDayWorklogs: (accountId: string, date: string, timeZone: string) =>
    [...jiraKeys.worklogReports(), 'my-day', { accountId, date, timeZone }] as const,
  /**
   * Prefixo das listas de issues em cache (ex: os cards de cada quadro), todas
   * com `{ issues: JiraIssue[] }`: quem muda uma issue troca ela em todas (`issueListsCache.ts`).
   */
  issueLists: () => ['jira', 'issue-lists'] as const,
  /** Issue pela chave (modal aberto pelo endereço, sem a issue na tela). */
  issue: (issueKey: string) => ['jira', 'issue', { issueKey }] as const,
  issueDetails: (issueKey: string) => ['jira', 'issue-details', { issueKey }] as const,
  issueWorklogs: (issueId: string) => ['jira', 'issue-worklogs', { issueId }] as const,
  issueTransitions: (issueId: string) => ['jira', 'issue-transitions', { issueId }] as const,
  /** Prefixo das listas de filhas (subtarefas) de todas as issues. */
  issueChildrenRoot: () => ['jira', 'issue-children'] as const,
  issueChildren: (issueKey: string) => [...jiraKeys.issueChildrenRoot(), { issueKey }] as const,
};

/** Chaves de cache da OpenRouter (a IA do Dashboard). */
export const openRouterKeys = {
  freeModels: () => ['openrouter', 'free-models'] as const,
  /** Uso da chave (pedidos gratuitos de hoje); o fim da chave separa uma chave da outra. */
  keyInfo: (keyTail: string) => ['openrouter', 'key-info', { keyTail }] as const,
};
