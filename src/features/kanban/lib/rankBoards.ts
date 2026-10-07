import type { Board } from '../types';

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/**
 * Ordena os quadros com o principal da squad primeiro (é o padrão quando
 * nenhum foi escolhido): os criados no projeto, depois os com o nome da squad
 * (ex: "CLIENTE - TAREFAS"), depois Kanban antes de Scrum, depois o mais antigo.
 */
export function rankBoards(boards: Board[], projectKey: string, projectName?: string): Board[] {
  const name = projectName ? normalize(projectName) : '';
  const key = projectKey.toLowerCase();

  function score(board: Board): number[] {
    const boardName = normalize(board.name);
    const matchesName = (name !== '' && boardName.startsWith(name)) || boardName.split(/[^a-z0-9]+/).includes(key);
    return [board.projectKey === projectKey ? 0 : 1, matchesName ? 0 : 1, board.type === 'kanban' ? 0 : 1, board.id];
  }

  return [...boards].sort((a, b) => {
    const [scoreA, scoreB] = [score(a), score(b)];
    const index = scoreA.findIndex((value, position) => value !== scoreB[position]);
    return index === -1 ? 0 : scoreA[index] - scoreB[index];
  });
}
