import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { retryUnlessClientError } from '../../../api/retryPolicy';
import { fetchStoryEpics } from './kanban-api';
import { kanbanKeys } from './queryKeys';

/** Épico de cada história das raias (agrupamento por história). */
export function useStoryEpicsQuery(storyKeys: string[], enabled: boolean) {
  return useQuery({
    queryKey: kanbanKeys.storyEpics(storyKeys),
    queryFn: ({ signal }) => fetchStoryEpics(storyKeys, signal),
    enabled: enabled && storyKeys.length > 0,
    // Novas histórias no quadro não apagam os épicos já mostrados enquanto busca.
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    retry: retryUnlessClientError,
  });
}
