import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { teamReportKeys } from './queryKeys';

/** Busca de novo o relatório na tela (mesmos filtros) e informa se há busca em andamento. */
export function useRefreshWorklogReport() {
  const queryClient = useQueryClient();
  const isRefreshing = useIsFetching({ queryKey: teamReportKeys.worklogReportRoot() }) > 0;

  function refresh() {
    return queryClient.invalidateQueries({ queryKey: teamReportKeys.worklogReportRoot() });
  }

  return { refresh, isRefreshing };
}
