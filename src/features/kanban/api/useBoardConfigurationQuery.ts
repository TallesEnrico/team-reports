import { useQuery } from '@tanstack/react-query';
import { retryUnlessClientError } from '../../../api/retryPolicy';
import type { Board } from '../types';
import { fetchBoardConfiguration } from './kanban-api';
import { kanbanKeys } from './queryKeys';

/** Colunas do quadro como o Jira as mostra (sem a do backlog do Kanban, quando ligado). */
export function useBoardConfigurationQuery(board: Board | undefined) {
  return useQuery({
    queryKey: kanbanKeys.configuration(board?.id ?? 0),
    queryFn: ({ signal }) => fetchBoardConfiguration(board!.id, board!.type, signal),
    enabled: board !== undefined,
    staleTime: 30 * 60_000,
    retry: retryUnlessClientError,
  });
}
