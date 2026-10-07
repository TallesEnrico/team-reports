import { useQuery } from '@tanstack/react-query';
import { useIsJiraConnected } from '../store/useJiraConnectionStore';
import { fetchProjects } from './jira-projects';
import { jiraKeys } from './queryKeys';
import { retryUnlessClientError } from './retryPolicy';

export function useProjectsQuery() {
  const isConnected = useIsJiraConnected();
  return useQuery({
    queryKey: jiraKeys.projects(),
    queryFn: ({ signal }) => fetchProjects(signal),
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
    enabled: isConnected,
    retry: retryUnlessClientError,
  });
}
