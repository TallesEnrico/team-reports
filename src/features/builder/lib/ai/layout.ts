import type { XYPosition } from '@xyflow/react';
import type { BuilderEdge } from '../../types';
import { inputsOf } from '../graph';

/** Distância entre as colunas (dados → transformar → mostrar) e entre as linhas do quadro. */
const COLUMN_STEP = 340;
const ROW_STEP = 240;

/**
 * Posições das peças montadas pela IA. Cada peça que termina uma cadeia (as de
 * Mostrar, quase sempre) ganha uma linha, na ordem da lista, e a coluna é a
 * distância até a peça de dados. Cada peça acima dela na cadeia fica na linha
 * da primeira peça final que a alcança. Assim, os blocos do dashboard, que
 * seguem a posição no quadro (de cima para baixo), saem na ordem em que a IA os
 * listou, e duas peças nunca ficam no mesmo lugar (cada peça tem uma entrada só:
 * na mesma coluna, as linhas são de cadeias diferentes).
 */
export function layoutPieces(ids: string[], edges: BuilderEdge[]): Map<string, XYPosition> {
  const inputs = inputsOf(edges);
  const feeds = new Set(edges.map((edge) => edge.source));
  const depths = new Map<string, number>();

  function depthOf(id: string, trail = new Set<string>()): number {
    const known = depths.get(id);
    if (known !== undefined) return known;
    const input = inputs.get(id);
    // Sem entrada (ou num círculo, que a validação já desfez): a primeira coluna.
    const depth = input && !trail.has(id) ? depthOf(input, trail.add(id)) + 1 : 0;
    depths.set(id, depth);
    return depth;
  }

  const positions = new Map<string, XYPosition>();
  let row = 0;
  for (const id of ids) {
    if (feeds.has(id)) continue;
    const y = row++ * ROW_STEP;
    for (let current: string | undefined = id; current && !positions.has(current); current = inputs.get(current)) {
      positions.set(current, { x: depthOf(current) * COLUMN_STEP, y });
    }
  }
  // Só sobra o que estiver num círculo.
  for (const id of ids) if (!positions.has(id)) positions.set(id, { x: 0, y: row++ * ROW_STEP });
  return positions;
}
