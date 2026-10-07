import { useQuery } from '@tanstack/react-query';
import { useIsJiraConnected } from '../../../store/useJiraConnectionStore';
import { fetchFields } from './jira-report-api';
import { teamReportKeys } from './queryKeys';
import { retryUnlessClientError } from '../../../api/retryPolicy';

export function useJiraFieldsQuery() {
  const isConnected = useIsJiraConnected();
  return useQuery({
    queryKey: teamReportKeys.fields(),
    queryFn: ({ signal }) => fetchFields(signal),
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
    enabled: isConnected,
    retry: retryUnlessClientError,
  });
}
