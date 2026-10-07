import { useQuery } from '@tanstack/react-query';
import { jiraKeys } from '../../../api/queryKeys';
import { retryUnlessClientError } from '../../../api/retryPolicy';
import { todayKey } from '../../../lib/dates';
import { fetchHomeIssues, fetchShortDays } from './home-metrics-api';

const STALE_TIME = 60_000;

export function useShortDaysQuery(accountId: string, timeZone: string) {
  const month = todayKey(timeZone).slice(0, 7);
  return useQuery({
    queryKey: [...jiraKeys.worklogReports(), 'home-short-days', { accountId, month, timeZone }],
    queryFn: ({ signal }) => fetchShortDays(accountId, timeZone, signal),
    staleTime: STALE_TIME,
    retry: retryUnlessClientError,
  });
}

export function useHomeIssuesQuery(accountId: string, kind: 'in-progress' | 'completed', timeZone: string) {
  const month = todayKey(timeZone).slice(0, 7);
  return useQuery({
    queryKey: [...jiraKeys.issueLists(), 'home', kind, { accountId, month }],
    queryFn: ({ signal }) => fetchHomeIssues(kind, timeZone, signal),
    staleTime: STALE_TIME,
    retry: retryUnlessClientError,
  });
}
