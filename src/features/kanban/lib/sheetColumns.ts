import type { SheetColumnKey, SheetSort } from '../types';

export interface SheetColumnDef {
  key: SheetColumnKey;
  label: string;
  /** Tempo: à direita, em fonte mono, com a soma no cabeçalho do grupo e no total. */
  numeric?: boolean;
  /** Sentido do primeiro clique para ordenar (tempos: do maior para o menor). */
  initial: SheetSort['direction'];
  /** Largura padrão, em px. */
  width: number;
  minWidth: number;
}

/**
 * Todas as colunas, na ordem em que aparecem. As larguras padrão das colunas
 * que aparecem sem escolha somam cerca de 1000 px: cabem numa tela de notebook
 * com a lateral aberta, sem a planilha rolar para o lado.
 */
export const SHEET_COLUMNS: SheetColumnDef[] = [
  { key: 'key', label: 'Chave', initial: 'asc', width: 92, minWidth: 72 },
  { key: 'summary', label: 'Resumo', initial: 'asc', width: 240, minWidth: 96 },
  { key: 'status', label: 'Status', initial: 'asc', width: 116, minWidth: 88 },
  { key: 'assignee', label: 'Responsável', initial: 'asc', width: 132, minWidth: 64 },
  { key: 'priority', label: 'Prioridade', initial: 'asc', width: 104, minWidth: 64 },
  { key: 'parent', label: 'Issue pai', initial: 'asc', width: 132, minWidth: 64 },
  { key: 'estimate', label: 'Estimativa', numeric: true, initial: 'desc', width: 80, minWidth: 56 },
  { key: 'spent', label: 'Lançado', numeric: true, initial: 'desc', width: 96, minWidth: 56 },
  { key: 'remaining', label: 'Restante', numeric: true, initial: 'desc', width: 80, minWidth: 56 },
];

/** A chave abre o modal da issue: sempre aparece. */
export const REQUIRED_SHEET_COLUMNS: SheetColumnKey[] = ['key'];

/** Colunas que aparecem sem escolha: todas menos a prioridade. */
export const DEFAULT_SHEET_COLUMNS: SheetColumnKey[] = SHEET_COLUMNS.map((column) => column.key).filter(
  (key) => key !== 'priority',
);

/** Coluna do fim, com o botão que escolhe as colunas. */
export const COLUMN_MENU_WIDTH = 36;

/** Maior largura de uma coluna, em px. */
export const MAX_COLUMN_WIDTH = 640;

/** Colunas visíveis na ordem da planilha, sempre com as obrigatórias (e sem chaves desconhecidas de versões antigas). */
export function visibleSheetColumns(chosen: SheetColumnKey[]): SheetColumnDef[] {
  const keys = new Set([...REQUIRED_SHEET_COLUMNS, ...chosen]);
  return SHEET_COLUMNS.filter((column) => keys.has(column.key));
}
