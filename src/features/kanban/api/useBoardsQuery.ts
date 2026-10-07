import { useQuery } from '@tanstack/react-query';
import { retryUnlessClientError } from '../../../api/retryPolicy';
import { useIsJiraConnected } from '../../../store/useJiraConnectionStore';
import { fetchBoards } from './kanban-api';
import { kanbanKeys } from './queryKeys';

export function useBoardsQuery(projectKey: string | undefined) {
  const isConnected = useIsJiraConnected();
  return useQuery({
    queryKey: kanbanKeys.boards(projectKey ?? ''),
    queryFn: ({ signal }) => fetchBoards(projectKey!, signal),
    enabled: isConnected && Boolean(projectKey),
    staleTime: 30 * 60_000,
    retry: retryUnlessClientError,
  });
}
