import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useIsJiraConnected } from '../store/useJiraConnectionStore';
import { searchOpenEpics } from './jira-issues';
import { jiraKeys } from './queryKeys';
import { retryUnlessClientError } from './retryPolicy';

/** Épicos abertos da squad, enquanto se digita no campo da história nova. */
export function useEpicOptionsQuery(projectKey: string, query: string, enabled: boolean) {
  const isConnected = useIsJiraConnected();
  const debounced = useDebouncedValue(query, 300);
  return useQuery({
    queryKey: jiraKeys.epicOptions(projectKey, debounced),
    queryFn: ({ signal }) => searchOpenEpics(projectKey, debounced, signal),
    enabled: isConnected && enabled,
    staleTime: 60_000,
    retry: retryUnlessClientError,
  });
}
