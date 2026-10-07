import { type QueryKey, useQuery } from '@tanstack/react-query';
import { retryUnlessClientError } from '../../../api/retryPolicy';
import type { BoardConfiguration, DoneWindow } from '../types';
import { type BoardIssues, fetchDoneBoardIssues, fetchOpenBoardIssues } from './kanban-api';
import { kanbanKeys } from './queryKeys';

export type { BoardIssues } from './kanban-api';

export interface DoneBoardIssues extends BoardIssues {
  /**
   * Pessoas da busca (`peopleKey`). Durante outra busca as concluídas ficam na
   * tela: com as mesmas pessoas, a busca é o "Carregar mais" (outra janela).
   */
  peopleKey: string;
}

/** As pessoas escolhidas numa ordem só, para comparar seleções. */
export function peopleKey(assignees: string[]): string {
  return [...assignees].sort().join(',');
}

/** Cards do quadro. Busca de novo ao voltar para a aba: o quadro muda com o time trabalhando. */
function useBoardCardsQuery<Cards extends BoardIssues>(
  configuration: BoardConfiguration | undefined,
  queryKey: QueryKey,
  fetchCards: (configuration: BoardConfiguration, signal: AbortSignal) => Promise<Cards>,
) {
  return useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchCards(configuration!, signal),
    enabled: configuration !== undefined,
    // Mesmo quadro (outra janela de concluídas ou outras pessoas): os cards
    // atuais ficam na tela até os novos chegarem. Outro quadro começa do zero.
    placeholderData: (previous, previousQuery) =>
      (previousQuery?.queryKey[2] as { boardId?: number } | undefined)?.boardId === configuration?.boardId
        ? previous
        : undefined,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: retryUnlessClientError,
  });
}

/** Cards abertos do quadro (todos). */
export function useOpenBoardIssuesQuery(configuration: BoardConfiguration | undefined, assignees: string[]) {
  return useBoardCardsQuery(configuration, kanbanKeys.openCards(configuration?.boardId ?? 0, assignees), (config, signal) =>
    fetchOpenBoardIssues(config, assignees, signal),
  );
}

/** Cards concluídos na janela (o "Carregar mais" amplia). */
export function useDoneBoardIssuesQuery(
  configuration: BoardConfiguration | undefined,
  doneWindow: DoneWindow,
  assignees: string[],
) {
  return useBoardCardsQuery<DoneBoardIssues>(
    configuration,
    kanbanKeys.doneCards(configuration?.boardId ?? 0, doneWindow, assignees),
    async (config, signal) => ({
      ...(await fetchDoneBoardIssues(config, doneWindow, assignees, signal)),
      peopleKey: peopleKey(assignees),
    }),
  );
}
