import type { BoardColumn, IssueTransition } from '../types';

/**
 * Para cada coluna, as transições da issue que levam a um status dela (sem
 * repetir status). Coluna fora do mapa não aceita o card. O status atual não
 * conta: soltar o card onde ele já está não faz nada.
 */
export function dropTargetsByColumn(
  columns: BoardColumn[],
  transitions: IssueTransition[],
  currentStatusId: string,
): Map<string, IssueTransition[]> {
  const targets = new Map<string, IssueTransition[]>();
  for (const column of columns) {
    const statusIds = new Set(column.statusIds);
    const seen = new Set<string>();
    const reachable = transitions.filter((transition) => {
      const statusId = transition.to.id;
      if (statusId === currentStatusId || !statusIds.has(statusId) || seen.has(statusId)) return false;
      seen.add(statusId);
      return true;
    });
    if (reachable.length > 0) targets.set(column.id, reachable);
  }
  return targets;
}

// Ids dos alvos de soltar: a coluna inteira (um status possível) ou uma faixa
// por status (vários status possíveis na mesma coluna, como no Jira).
// No agrupamento por história a mesma coluna aparece em cada raia: `scope`
// (a chave da raia) deixa cada alvo único.
function scoped(id: string, scope?: string): string {
  return scope ? `lane:${scope}|${id}` : id;
}

export function columnDropId(columnId: string, scope?: string): string {
  return scoped(`column:${columnId}`, scope);
}

export function statusDropId(columnId: string, statusId: string, scope?: string): string {
  return scoped(`column:${columnId}:status:${statusId}`, scope);
}

/** Transição correspondente ao alvo em que o card foi solto; `undefined` = nada a fazer. */
export function transitionForDrop(
  dropId: string,
  targets: Map<string, IssueTransition[]>,
): IssueTransition | undefined {
  const match = /^(?:lane:[^|]+\|)?column:([^:]+)(?::status:(.+))?$/.exec(dropId);
  if (!match) return undefined;
  const [, columnId, statusId] = match;
  const reachable = targets.get(columnId) ?? [];
  if (statusId) return reachable.find((transition) => transition.to.id === statusId);
  return reachable.length === 1 ? reachable[0] : undefined;
}
