import type { Connection } from '@xyflow/react';
import type { BuilderEdge, BuilderNode, DataShape, PieceKind } from '../types';
import { PIECES } from './catalog';

/** Quem alimenta cada peça (cada peça tem uma entrada só). */
export function inputsOf(edges: BuilderEdge[]): Map<string, string> {
  return new Map(edges.map((edge) => [edge.target, edge.source]));
}

/**
 * Formato do que sai de uma peça, só pela montagem (sem esperar os dados): as
 * fontes dão registros; Agrupar e Ordenar, dados agrupados; Filtrar repete o que
 * entra nele.
 */
export function shapeOf(nodeId: string, nodes: BuilderNode[], edges: BuilderEdge[]): DataShape {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const inputs = inputsOf(edges);
  const seen = new Set<string>();
  let current: string | undefined = nodeId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = byId.get(current);
    if (!node) return 'unknown';
    const kind: PieceKind = node.type;
    if (PIECES[kind].category === 'source') return 'records';
    if (kind === 'group' || kind === 'sort') return 'aggregate';
    if (kind !== 'filter') return 'unknown';
    current = inputs.get(current);
  }
  return 'unknown';
}

/** `target` alcança `source` seguindo as saídas (ligar os dois fecharia um círculo). */
function reaches(from: string, to: string, edges: BuilderEdge[]): boolean {
  const stack = [from];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === to) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of edges) if (edge.source === current) stack.push(edge.target);
  }
  return false;
}

export type ConnectionCheck = { ok: true } | { ok: false; reason: string };

/** Se a saída de uma peça encaixa na entrada da outra, e por quê não. */
export function checkConnection(
  connection: Pick<Connection, 'source' | 'target'>,
  nodes: BuilderNode[],
  edges: BuilderEdge[],
): ConnectionCheck {
  const source = nodes.find((node) => node.id === connection.source);
  const target = nodes.find((node) => node.id === connection.target);
  if (!source || !target || source.id === target.id) return { ok: false, reason: 'Ligue duas peças diferentes.' };
  const sourceDef = PIECES[source.type];
  const targetDef = PIECES[target.type];
  if (!sourceDef.hasOutput) return { ok: false, reason: `${sourceDef.name} não tem saída: ela vira um bloco do dashboard.` };
  if (!targetDef.accepts) return { ok: false, reason: `${targetDef.name} não recebe dados: ela busca no Jira.` };
  if (reaches(target.id, source.id, edges)) return { ok: false, reason: 'Essa ligação fecharia um círculo.' };

  const shape = shapeOf(source.id, nodes, edges);
  if (shape !== 'unknown' && !targetDef.accepts.includes(shape)) {
    return {
      ok: false,
      reason:
        shape === 'records'
          ? `${targetDef.name} precisa de dados agrupados: encaixe um "Agrupar e cruzar" antes.`
          : `${targetDef.name} recebe os dados sem agrupar: ligue direto à peça de dados ou a um "Filtrar".`,
    };
  }
  return { ok: true };
}

/** Distância (px) em que duas peças contam como da mesma linha do dashboard. */
const ROW_TOLERANCE = 90;

/**
 * Ordem dos blocos no dashboard: a posição das peças de visualização no quadro,
 * de cima para baixo e, na mesma altura, da esquerda para a direita.
 */
export function dashboardOrder<Node extends BuilderNode>(nodes: Node[]): Node[] {
  const byY = [...nodes].sort((a, b) => a.position.y - b.position.y);
  const rows: Node[][] = [];
  for (const node of byY) {
    const row = rows[rows.length - 1];
    if (row && node.position.y - row[0].position.y < ROW_TOLERANCE) row.push(node);
    else rows.push([node]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.position.x - b.position.x));
}
