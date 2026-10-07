import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useIsJiraConnected } from '../../../store/useJiraConnectionStore';
import { fetchWorklogReport } from './jira-report-api';
import { teamReportKeys } from './queryKeys';
import { retryUnlessClientError } from '../../../api/retryPolicy';
import type { ReportFilters } from '../types';

/**
 * Busca issues + worklogs do período. `filters` é `null` até o primeiro
 * "Gerar relatório"; só roda com filtros e com o usuário atual conhecido.
 */
export function useWorklogReportQuery(filters: ReportFilters | null, currentAccountId: string | undefined) {
  const isConnected = useIsJiraConnected();
  return useQuery({
    queryKey: teamReportKeys.worklogReport(filters, currentAccountId),
    queryFn: ({ signal }) => fetchWorklogReport(filters!, currentAccountId!, signal),
    enabled: isConnected && Boolean(filters && currentAccountId),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: retryUnlessClientError,
  });
}
