import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useIsJiraConnected } from '../../../store/useJiraConnectionStore';
import { searchUsersAndGroups } from './jira-report-api';
import { teamReportKeys } from './queryKeys';
import { retryUnlessClientError } from '../../../api/retryPolicy';

const MIN_QUERY_LENGTH = 2;

export function useUserGroupSearchQuery(query: string) {
  const trimmed = query.trim();
  const isConnected = useIsJiraConnected();
  return useQuery({
    queryKey: teamReportKeys.userGroupSearch(trimmed),
    queryFn: ({ signal }) => searchUsersAndGroups(trimmed, signal),
    enabled: isConnected && trimmed.length >= MIN_QUERY_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    retry: retryUnlessClientError,
  });
}
