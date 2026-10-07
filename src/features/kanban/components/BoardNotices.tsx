import { Notice, ReadOnlyNotice } from '../../../components/Notice';
import { BOARD_ISSUE_LIMIT } from '../api/kanban-api';
import type { useKanbanBoard } from '../hooks/useKanbanBoard';

interface BoardNoticesProps {
  board: ReturnType<typeof useKanbanBoard>;
  /** Token sem `write:jira-work` (com o quadro na tela). */
  showReadOnly: boolean;
  /** O que fica bloqueado sem escrita, no infinitivo (ex: "mover cards e lançar horas"). */
  readOnlyAction: string;
  /** Issue do endereço que não abriu. */
  openIssueFailure: { key: string; message: string } | null;
  className?: string;
}

/** Avisos das telas do quadro: somente leitura, issue do endereço que não abriu e cards cortados pelo limite da busca. */
export function BoardNotices({ board, showReadOnly, readOnlyAction, openIssueFailure, className }: BoardNoticesProps) {
  return (
    <>
      {showReadOnly && <ReadOnlyNotice action={readOnlyAction} className={className} />}
      {openIssueFailure && (
        <Notice tone="warning" className={className}>
          Não foi possível abrir a issue {openIssueFailure.key} do endereço: {openIssueFailure.message}
        </Notice>
      )}
      {board.truncated.open && (
        <Notice tone="warning" className={className}>
          O quadro tem mais de {BOARD_ISSUE_LIMIT} issues abertas: mostrando as primeiras, na ordem do quadro.
        </Notice>
      )}
      {board.truncated.done && (
        <Notice tone="warning" className={className}>
          Mais de {BOARD_ISSUE_LIMIT} issues concluídas no período: mostrando as primeiras, na ordem do quadro.
        </Notice>
      )}
    </>
  );
}
