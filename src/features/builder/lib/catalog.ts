import {
  ChartBar,
  ChartBarHorizontal,
  Clock,
  Funnel,
  GridFour,
  GridNine,
  Hash,
  type Icon,
  ListChecks,
  SortDescending,
  Table,
} from '@phosphor-icons/react';
import type {
  DataShape,
  PeopleChoice,
  PieceCategory,
  PieceConfigs,
  PieceKind,
  SourceKind,
  VisualConfig,
  VisualKind,
  WidgetWidth,
} from '../types';

export interface PieceDef {
  kind: PieceKind;
  category: PieceCategory;
  name: string;
  /** Uma linha, na paleta de peças. */
  description: string;
  icon: Icon;
  /** O que a entrada aceita; `null` = sem entrada (peças de dados). */
  accepts: DataShape[] | null;
  /** Tem saída (as visualizações não têm: viram blocos do dashboard). */
  hasOutput: boolean;
}

export const CATEGORY_LABELS: Record<PieceCategory, string> = {
  source: 'Dados',
  transform: 'Transformar',
  visual: 'Mostrar',
};

export const PIECES: Record<PieceKind, PieceDef> = {
  worklogs: {
    kind: 'worklogs',
    category: 'source',
    name: 'Horas lançadas',
    description: 'Apontamentos do Jira num período: quem, quando, em qual issue.',
    icon: Clock,
    accepts: null,
    hasOutput: true,
  },
  issues: {
    kind: 'issues',
    category: 'source',
    name: 'Issues',
    description: 'Issues abertas, concluídas ou criadas: status, estimativa e tempo.',
    icon: ListChecks,
    accepts: null,
    hasOutput: true,
  },
  filter: {
    kind: 'filter',
    category: 'transform',
    name: 'Filtrar',
    description: 'Fica só com (ou tira) pessoas, projetos, status…',
    icon: Funnel,
    accepts: ['records', 'aggregate'],
    hasOutput: true,
  },
  group: {
    kind: 'group',
    category: 'transform',
    name: 'Agrupar e cruzar',
    description: 'Soma por pessoa, dia, projeto… e cruza com um segundo campo.',
    icon: GridFour,
    accepts: ['records'],
    hasOutput: true,
  },
  sort: {
    kind: 'sort',
    category: 'transform',
    name: 'Ordenar',
    description: 'Maiores primeiro, só os N primeiros, o resto em "Outros".',
    icon: SortDescending,
    accepts: ['aggregate'],
    hasOutput: true,
  },
  number: {
    kind: 'number',
    category: 'visual',
    name: 'Número',
    description: 'Um total em destaque: horas, issues, pessoas.',
    icon: Hash,
    accepts: ['records', 'aggregate'],
    hasOutput: false,
  },
  bars: {
    kind: 'bars',
    category: 'visual',
    name: 'Barras',
    description: 'Compara grupos lado a lado, do maior para o menor.',
    icon: ChartBarHorizontal,
    accepts: ['aggregate'],
    hasOutput: false,
  },
  columns: {
    kind: 'columns',
    category: 'visual',
    name: 'Colunas',
    description: 'Evolução no tempo: por dia, semana ou mês.',
    icon: ChartBar,
    accepts: ['aggregate'],
    hasOutput: false,
  },
  heatmap: {
    kind: 'heatmap',
    category: 'visual',
    name: 'Mapa de calor',
    description: 'O cruzamento de dois campos numa grade (ex: pessoa × dia).',
    icon: GridNine,
    accepts: ['aggregate'],
    hasOutput: false,
  },
  table: {
    kind: 'table',
    category: 'visual',
    name: 'Tabela',
    description: 'Os números em linhas e colunas, para conferir.',
    icon: Table,
    accepts: ['records', 'aggregate'],
    hasOutput: false,
  },
};

export const PIECE_ORDER: PieceKind[] = [
  'worklogs',
  'issues',
  'filter',
  'group',
  'sort',
  'number',
  'bars',
  'columns',
  'heatmap',
  'table',
];

export function isSourceKind(kind: PieceKind): kind is SourceKind {
  return PIECES[kind].category === 'source';
}

export function isVisualKind(kind: PieceKind): kind is VisualKind {
  return PIECES[kind].category === 'visual';
}

const WIDTHS: Record<VisualKind, WidgetWidth> = {
  number: 'quarter',
  bars: 'half',
  columns: 'half',
  heatmap: 'full',
  table: 'full',
};

/** Todas as pessoas: o padrão das peças de dados (o Dashboard é para a gestão, não só para a própria squad). */
export function allPeople(): PeopleChoice {
  return { mode: 'all', accountIds: [], names: {} };
}

function visualConfig(kind: VisualKind): VisualConfig {
  return { title: '', width: WIDTHS[kind], measure: null };
}

/** Campos do Agrupar que combinam com cada gráfico (horas lançadas / issues). */
const GROUP_FOR_VISUAL: Partial<Record<VisualKind, Record<SourceKind, { by: string; series: string | null }>>> = {
  columns: { worklogs: { by: 'day', series: null }, issues: { by: 'createdWeek', series: null } },
  heatmap: { worklogs: { by: 'person', series: 'day' }, issues: { by: 'assignee', series: 'statusCategory' } },
};

/**
 * Configuração de uma peça nova. `source` é a fonte que chega nela (quando já
 * encaixada), para o Agrupar começar num campo que existe nessa fonte; `forVisual`,
 * o gráfico que vem depois dele (Colunas agrupa por dia; Mapa de calor cruza pessoa × dia).
 */
export function defaultConfig<Kind extends PieceKind>(kind: Kind, source?: SourceKind, forVisual?: VisualKind): PieceConfigs[Kind] {
  const groupFields = (forVisual && GROUP_FOR_VISUAL[forVisual]?.[source ?? 'worklogs']) ?? {
    by: source === 'issues' ? 'project' : 'person',
    series: null,
  };
  const configs: PieceConfigs = {
    // Peças novas começam com todas as squads e todas as pessoas.
    // O período segue o do dashboard (o seletor do cabeçalho).
    worklogs: { period: { preset: 'dashboard', from: null, to: null }, projectKeys: [], people: allPeople(), jql: '' },
    issues: {
      projectKeys: [],
      selection: 'open',
      period: { preset: 'dashboard', from: null, to: null },
      assignee: allPeople(),
      jql: '',
    },
    filter: { field: null, mode: 'include', values: [], labels: {} },
    group: { ...groupFields, measure: source === 'issues' ? 'count' : 'hours' },
    sort: { order: 'value-desc', limit: 10, others: false },
    number: visualConfig('number'),
    bars: visualConfig('bars'),
    columns: visualConfig('columns'),
    heatmap: visualConfig('heatmap'),
    table: visualConfig('table'),
  };
  return configs[kind];
}

export interface NextPiece {
  kind: PieceKind;
  /** Só encaixa com um "Agrupar e cruzar" antes, que entra junto. */
  viaGroup: boolean;
}

/**
 * Peças que encaixam depois de uma saída com este formato (o "+" de cada peça).
 * Depois de dados sem agrupar, os gráficos que pedem agrupamento também
 * aparecem: o "Agrupar e cruzar" entra junto, já configurado para eles.
 */
export function nextPieces(shape: DataShape): NextPiece[] {
  return PIECE_ORDER.flatMap((kind): NextPiece[] => {
    const { accepts } = PIECES[kind];
    if (!accepts) return [];
    if (shape === 'unknown' || accepts.includes(shape)) return [{ kind, viaGroup: false }];
    return shape === 'records' && PIECES[kind].category === 'visual' ? [{ kind, viaGroup: true }] : [];
  });
}

/** Se a peça precisa de um "Agrupar" entre ela e uma saída com este formato. */
export function needsGroup(kind: PieceKind, shape: DataShape): boolean {
  const { accepts } = PIECES[kind];
  return shape === 'records' && Boolean(accepts) && !accepts!.includes('records') && PIECES[kind].category === 'visual';
}
