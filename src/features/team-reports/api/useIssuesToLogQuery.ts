import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { retryUnlessClientError } from '../../../api/retryPolicy';
import { matchIssuesToLog } from '../lib/matchIssuesToLog';
import { fetchIssuesToLog, type IssuesToLog } from './issues-to-log-api';
import { teamReportKeys } from './queryKeys';

/**
 * Tarefas abertas da pessoa para o "Lançar horas", já filtradas pela pesquisa.
 * A lista vem do Jira uma vez; digitar só filtra no navegador (sem esperar a rede).
 */
export function useIssuesToLogQuery(term: string, enabled: boolean) {
  const select = useCallback(
    (data: IssuesToLog) => ({ ...matchIssuesToLog(data, term), isTruncated: data.isTruncated }),
    [term],
  );
  return useQuery({
    queryKey: teamReportKeys.issuesToLog(),
    queryFn: ({ signal }) => fetchIssuesToLog(signal),
    select,
    enabled,
    staleTime: 30_000,
    retry: retryUnlessClientError,
  });
}
