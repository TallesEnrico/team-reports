import { useQuery } from '@tanstack/react-query';
import { type DateKey, isDateKey } from '../lib/dates';
import { useIsJiraConnected } from '../store/useJiraConnectionStore';
import { fetchMyDayWorklogs } from './jira-day-worklogs';
import { jiraKeys } from './queryKeys';
import { retryUnlessClientError } from './retryPolicy';
import { useCurrentUserQuery } from './useCurrentUserQuery';

/** Apontamentos da conta conectada no dia, para a linha do tempo do "Lançar horas". */
export function useMyDayWorklogsQuery(date: DateKey, timeZone: string) {
  const isConnected = useIsJiraConnected();
  const accountId = useCurrentUserQuery().data?.accountId;
  return useQuery({
    queryKey: jiraKeys.myDayWorklogs(accountId ?? '', date, timeZone),
    queryFn: ({ signal }) => fetchMyDayWorklogs(accountId!, date, timeZone, signal),
    enabled: isConnected && Boolean(accountId) && isDateKey(date),
    staleTime: 60_000,
    retry: retryUnlessClientError,
  });
}
