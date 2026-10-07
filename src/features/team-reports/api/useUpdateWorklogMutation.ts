import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isTokenRejected, JiraApiError } from '../../../api/jira-client';
import { updateWorklog, type WorklogEntry, type WorklogInput } from '../../../api/jira-worklogs';
import { jiraKeys } from '../../../api/queryKeys';
import type { WorklogReport } from '../types';
import { teamReportKeys } from './queryKeys';

interface UpdateWorklogVariables {
  worklog: WorklogEntry;
  input: WorklogInput;
}

export function useUpdateWorklogMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ worklog, input }: UpdateWorklogVariables) => updateWorklog(worklog, input),
    onSuccess: (updated) => {
      const root = teamReportKeys.worklogReportRoot();
      // Troca o apontamento nos relatórios em cache: buscar o relatório inteiro de
      // novo custaria uma requisição por issue só para refletir uma alteração.
      queryClient.setQueriesData<WorklogReport>({ queryKey: root }, (report) =>
        report && {
          ...report,
          worklogs: report.worklogs.map((worklog) => (worklog.id === updated.id ? updated : worklog)),
        },
      );
      // Outros campos podem ter mudado no Jira (ex: estimativa restante); a próxima busca os traz.
      void queryClient.invalidateQueries({ queryKey: root, refetchType: 'none' });
    },
    onError: (error) => {
      // Com a conta já validada, 401 numa escrita é falta de escopo: a tela passa a só leitura.
      if (error instanceof JiraApiError && error.status === 401 && !isTokenRejected(error)) {
        queryClient.setQueryData(jiraKeys.writeAccess(), false);
      }
    },
  });
}
