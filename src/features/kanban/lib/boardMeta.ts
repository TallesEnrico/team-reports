import type { useKanbanBoard } from '../hooks/useKanbanBoard';
import { ME } from '../types';

/**
 * Resumo do cabeçalho das telas do quadro: quadro, squad e quantos cards (das
 * pessoas escolhidas) aparecem, "N de M" com filtros. Sem `counts`, só quadro e squad.
 */
export function boardMeta(
  board: ReturnType<typeof useKanbanBoard>,
  counts?: { shown: number; total: number; isFiltered: boolean },
): string[] {
  const onlyMe = board.assignees.length === 1 && board.assignees[0] === ME;
  const everyone = board.assignees.length === 0;
  const people = `${board.assignees.length} ${board.assignees.length === 1 ? 'pessoa' : 'pessoas'}`;
  const cardsOf = everyone ? 'cards de todas as pessoas' : onlyMe ? 'cards seus' : `cards de ${people}`;
  return [
    board.board?.name ?? 'Quadro',
    board.projectKey ? `Squad ${board.project?.name ?? board.projectKey}` : '',
    counts ? (counts.isFiltered ? `${counts.shown} de ${counts.total} ${cardsOf}` : `${counts.total} ${cardsOf}`) : '',
  ].filter(Boolean);
}
