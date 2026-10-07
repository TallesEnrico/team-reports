import type { BuilderEdge, BuilderNode, Dataset, DatasetContext, PieceResult } from '../types';
import { isSourceKind, PIECES } from './catalog';
import { filterDataset, groupDataset, sortDataset } from './datasets';
import { inputsOf } from './graph';

/** Registros de uma peça de dados, como vêm da busca. */
export interface SourceData {
  dataset: Dataset;
  /** A busca parou no limite de issues: os números podem estar incompletos. */
  isTruncated: boolean;
}

/** Estado da busca de cada peça de dados. */
export type SourceState =
  | { status: 'idle'; message: string }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: SourceData; isStale?: boolean };

const TRUNCATED_NOTE = 'A busca parou no limite de 5.000 issues: os números podem estar incompletos. Diminua o período ou escolha menos squads.';

/** As pessoas escolhidas na peça de dados, com o nome guardado na escolha. */
function rosterOf(node: BuilderNode): DatasetContext['roster'] {
  const choice = node.type === 'worklogs' ? node.data.people : node.type === 'issues' ? node.data.assignee : undefined;
  if (choice?.mode !== 'chosen') return undefined;
  return choice.accountIds.map((accountId) => ({ accountId, displayName: choice.names[accountId] ?? accountId }));
}

function sourceResult(node: BuilderNode, state: SourceState | undefined): PieceResult {
  if (!state || state.status === 'loading') return { state: 'loading' };
  if (state.status === 'idle') return { state: 'idle', message: state.message };
  if (state.status === 'error') return { state: 'error', message: state.message };
  const roster = rosterOf(node);
  const data = roster ? ({ ...state.data.dataset, roster } as Dataset) : state.data.dataset;
  return { state: 'ready', data, note: state.data.isTruncated ? TRUNCATED_NOTE : undefined, isStale: state.isStale };
}

const NEEDS_GROUP = 'Encaixe um "Agrupar e cruzar" antes, para dizer o que comparar.';

/** O que sai de uma peça que não é de dados; o aviso da busca (ex: parou no limite) e os dados antigos na tela seguem junto. */
function runPiece(node: BuilderNode, input: PieceResult | undefined): PieceResult {
  const output = transform(node, input);
  if (output.state !== 'ready' || input?.state !== 'ready' || (!input.note && !input.isStale)) return output;
  return { ...output, note: output.note ?? input.note, isStale: input.isStale };
}

/** O que sai de uma peça que não é de dados, a partir do que entra nela. */
function transform(node: BuilderNode, input: PieceResult | undefined): PieceResult {
  if (!input) {
    return {
      state: 'idle',
      message: PIECES[node.type].category === 'visual' ? 'Encaixe uma peça à esquerda para mostrar os dados dela.' : 'Encaixe uma peça à esquerda para receber dados.',
    };
  }
  if (input.state === 'loading') return input;
  if (input.state === 'error') return { state: 'idle', message: 'A peça anterior está com erro.' };
  if (input.state === 'idle') return { state: 'idle', message: 'Esperando a peça anterior.' };

  const { data } = input;
  switch (node.type) {
    case 'filter':
      return { state: 'ready', data: filterDataset(data, node.data) };
    case 'group':
      if (data.kind !== 'records') {
        return { state: 'idle', message: 'Os dados já chegam agrupados: ligue esta peça direto à peça de dados ou a um "Filtrar".' };
      }
      return { state: 'ready', data: groupDataset(data, node.data) };
    case 'sort':
      if (data.kind !== 'aggregate') return { state: 'idle', message: 'Ordene depois de agrupar. ' + NEEDS_GROUP, fix: 'insert-group' };
      return { state: 'ready', data: sortDataset(data, node.data) };
    case 'bars':
    case 'columns':
      if (data.kind !== 'aggregate') return { state: 'idle', message: NEEDS_GROUP, fix: 'insert-group' };
      return { state: 'ready', data };
    case 'heatmap':
      if (data.kind !== 'aggregate') return { state: 'idle', message: NEEDS_GROUP, fix: 'insert-group' };
      if (!data.spec.by || !data.spec.series) {
        return { state: 'idle', message: 'No "Agrupar e cruzar", escolha os dois campos: as linhas e as colunas da grade.' };
      }
      return { state: 'ready', data };
    case 'number':
    case 'table':
      return { state: 'ready', data };
    default:
      return { state: 'idle', message: '' };
  }
}

interface CacheEntry {
  type: string;
  config: unknown;
  input: PieceResult | SourceState | undefined;
  output: PieceResult;
}

/**
 * Avalia a montagem: o que sai de cada peça, seguindo as ligações. Guarda o
 * resultado de cada peça e só recalcula quando a configuração dela ou o que
 * entra nela muda (arrastar peças no quadro não recalcula nada). Sem nenhuma
 * mudança, devolve o mesmo objeto da vez anterior.
 */
export function createEvaluator() {
  const cache = new Map<string, CacheEntry>();
  let previous: Record<string, PieceResult> = {};

  return function evaluate(
    nodes: BuilderNode[],
    edges: BuilderEdge[],
    sources: Record<string, SourceState>,
  ): Record<string, PieceResult> {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const inputs = inputsOf(edges);
    const results: Record<string, PieceResult> = {};
    const visiting = new Set<string>();

    function resultOf(id: string): PieceResult {
      const done = results[id];
      if (done) return done;
      const node = byId.get(id)!;
      if (visiting.has(id)) return { state: 'error', message: 'As ligações formam um círculo.' };
      visiting.add(id);

      let input: PieceResult | SourceState | undefined;
      if (isSourceKind(node.type)) {
        input = sources[id];
      } else {
        const inputId = inputs.get(id);
        input = inputId && byId.has(inputId) ? resultOf(inputId) : undefined;
      }

      const cached = cache.get(id);
      let output: PieceResult;
      if (cached && cached.type === node.type && cached.config === node.data && sameInput(cached.input, input)) {
        output = cached.output;
      } else {
        output = isSourceKind(node.type) ? sourceResult(node, input as SourceState | undefined) : runPiece(node, input as PieceResult | undefined);
        cache.set(id, { type: node.type, config: node.data, input, output });
      }

      visiting.delete(id);
      results[id] = output;
      return output;
    }

    for (const node of nodes) resultOf(node.id);
    for (const id of cache.keys()) if (!byId.has(id)) cache.delete(id);

    // Nada mudou (ex: arrastando peças): o mesmo objeto, para quem depende dele não renderizar de novo.
    const ids = Object.keys(results);
    if (ids.length === Object.keys(previous).length && ids.every((id) => previous[id] === results[id])) return previous;
    previous = results;
    return results;
  };
}

/** O estado da busca é recriado a cada render; o que importa é o mesmo status, mensagem e dados. */
function sameInput(a: PieceResult | SourceState | undefined, b: PieceResult | SourceState | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || !('status' in a) || !('status' in b) || a.status !== b.status) return false;
  if (a.status === 'success') return b.status === 'success' && a.data === b.data && a.isStale === b.isStale;
  if (a.status === 'idle' || a.status === 'error') return 'message' in b && a.message === b.message;
  return true;
}
