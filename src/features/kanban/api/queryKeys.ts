import { jiraKeys } from '../../../api/queryKeys';

export const kanbanKeys = {
  boards: (projectKey: string) => ['kanban', 'boards', { projectKey }] as const,
  configuration: (boardId: number) => ['kanban', 'configuration', { boardId }] as const,
  /**
   * Prefixo dos cards de um quadro (abertos e concluídos, de todas as janelas). Fica entre
   * as listas de issues (`jiraKeys.issueLists`): mudar uma issue em qualquer tela atualiza o card.
   */
  issues: (boardId: number) => [...jiraKeys.issueLists(), { boardId }] as const,
  openCards: (boardId: number, assignees: string[]) =>
    [...kanbanKeys.issues(boardId), 'open', { assignees: [...assignees].sort() }] as const,
  doneCards: (boardId: number, doneWindow: string, assignees: string[]) =>
    [...kanbanKeys.issues(boardId), 'done', { doneWindow, assignees: [...assignees].sort() }] as const,
  storyEpics: (storyKeys: string[]) => ['kanban', 'story-epics', { storyKeys: [...storyKeys].sort() }] as const,
};
