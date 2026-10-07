import { useMemo } from 'react';
import { useProjectsQuery } from '../../../api/useProjectsQuery';
import { useSquadMembersQuery } from '../../../api/useSquadMembersQuery';
import { useJiraConnectionStore } from '../../../store/useJiraConnectionStore';
import { useBoardConfigurationQuery } from '../api/useBoardConfigurationQuery';
import {
  type BoardIssues,
  peopleKey,
  useDoneBoardIssuesQuery,
  useOpenBoardIssuesQuery,
} from '../api/useBoardIssuesQuery';
import { useBoardsQuery } from '../api/useBoardsQuery';
import { rankBoards } from '../lib/rankBoards';
import { useKanbanStore } from '../store/useKanbanStore';
import { type JiraIssue, ME } from '../types';

/**
 * Abertas e concluídas, na ordem do quadro. Uma issue que acabou de mudar de
 * categoria pode estar nas duas listas até as duas buscarem de novo: fica uma só.
 */
function mergeBoardIssues(open: BoardIssues, done: BoardIssues): JiraIssue[] {
  const openIds = new Set(open.issues.map((issue) => issue.id));
  return [...open.issues, ...done.issues.filter((issue) => !openIds.has(issue.id))];
}

/**
 * Quadro exibido: a squad escolhida na lateral (ou a da conta conectada), os
 * quadros dela, o escolhido (o salvo ou o primeiro), as colunas e os cards.
 * Usado pela lateral e pela tela.
 */
export function useKanbanBoard() {
  const connectedSquad = useJiraConnectionStore((state) => state.credentials?.squad);
  const savedProjectKey = useKanbanStore((state) => state.projectKey);
  const projectsQuery = useProjectsQuery();
  const projects = projectsQuery.data ?? [];

  // Squad salva que a conta não enxerga (ex: outra conta conectada depois) volta à squad da conta.
  const isSavedVisible = !projectsQuery.data || projects.some((project) => project.key === savedProjectKey);
  const projectKey = (isSavedVisible ? savedProjectKey : null) ?? connectedSquad;
  const project = projects.find((candidate) => candidate.key === projectKey);

  const savedBoardId = useKanbanStore((state) => (projectKey ? state.boardIdByProject[projectKey] : undefined));
  const boardsQuery = useBoardsQuery(projectKey);
  const boards = useMemo(
    () => (boardsQuery.data && projectKey ? rankBoards(boardsQuery.data, projectKey, project?.name) : []),
    [boardsQuery.data, projectKey, project?.name],
  );
  // O escolhido na lateral; sem escolha, o principal da squad (rankBoards).
  const board = boards.find((candidate) => candidate.id === savedBoardId) ?? boards[0];

  const membersQuery = useSquadMembersQuery(projectKey);
  const savedAssignees = useKanbanStore((state) => (projectKey ? state.assigneesByProject[projectKey] : undefined));
  // Sem escolha salva, só a conta conectada. Lista vazia é escolha: o quadro não filtra por pessoa.
  const assignees = useMemo(() => savedAssignees ?? [ME], [savedAssignees]);

  const doneWindow = useKanbanStore((state) => state.doneWindow);
  const configurationQuery = useBoardConfigurationQuery(board);
  const openQuery = useOpenBoardIssuesQuery(configurationQuery.data, assignees);
  const doneQuery = useDoneBoardIssuesQuery(configurationQuery.data, doneWindow, assignees);
  const issues = useMemo(
    () => (openQuery.data && doneQuery.data ? mergeBoardIssues(openQuery.data, doneQuery.data) : undefined),
    [openQuery.data, doneQuery.data],
  );
  // "Carregar mais": na tela, as concluídas das mesmas pessoas, numa janela menor
  // (trocar as pessoas também deixa as anteriores na tela, mas esmaece o quadro).
  const isLoadingMoreDone = doneQuery.isPlaceholderData && doneQuery.data?.peopleKey === peopleKey(assignees);

  return {
    connectedSquad,
    projectKey,
    project,
    projects,
    members: membersQuery.data ?? [],
    assignees,
    boards,
    board,
    configuration: configurationQuery.data,
    issues,
    truncated: { open: openQuery.data?.truncated ?? false, done: doneQuery.data?.truncated ?? false },
    doneWindow,
    /** Buscando os cards de novo com eles na tela ("Atualizar", outras pessoas, a volta à aba). */
    isRefreshing: openQuery.isFetching || (doneQuery.isFetching && !isLoadingMoreDone),
    /** Buscando as concluídas de um período maior ("Carregar mais"). */
    isLoadingMoreDone,
    refresh: () => Promise.all([openQuery.refetch(), doneQuery.refetch()]),
    projectsQuery,
    membersQuery,
    boardsQuery,
    configurationQuery,
    error: boardsQuery.error ?? configurationQuery.error ?? openQuery.error ?? doneQuery.error,
  };
}
