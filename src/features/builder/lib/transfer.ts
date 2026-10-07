import { isDateKey } from '../../../lib/dates';
import type {
  BuilderEdge,
  BuilderNode,
  Dashboard,
  FilterConfig,
  GroupConfig,
  HeatColors,
  IssuesConfig,
  PeopleChoice,
  PeriodConfig,
  PieceKind,
  ProjectChoice,
  SortConfig,
  VisualConfig,
  WorklogsConfig,
} from '../types';
import { allPeople, defaultConfig, isVisualKind, PIECES } from './catalog';
import { ISSUE_SELECTIONS, SORT_ORDERS } from './describe';
import { DEFAULT_DASHBOARD_PERIOD, PERIOD_OPTIONS } from './periods';
import { ISSUE_SCHEMA, WORKLOG_SCHEMA } from './schema';

/** Identifica o arquivo exportado (o app não lê outros JSON). */
const FORMAT = 'team-dashboard';
const VERSION = 1;

/** Limites de um arquivo importado: o bastante para qualquer dashboard real, sem travar a tela. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_NODES = 300;
const MAX_EDGES = 600;

/** O dashboard como vai para o arquivo: só a montagem, nunca dados do Jira. */
export interface DashboardFile {
  format: typeof FORMAT;
  version: typeof VERSION;
  exportedAt: string;
  dashboard: {
    name: string;
    period: PeriodConfig;
    nodes: { id: string; type: PieceKind; position: { x: number; y: number }; data: unknown }[];
    edges: { source: string; target: string }[];
  };
}

/** Um dashboard lido de um arquivo, já validado (ids novos são dados ao criar). */
export interface ImportedDashboard {
  name: string;
  period: PeriodConfig;
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  /** Peças ou ligações do arquivo que não deu para aproveitar. */
  skipped: number;
}

/** O .json do dashboard; `compact` tira os espaços (no link e nas conexões, onde ninguém lê o texto). */
export function serializeDashboard(dashboard: Dashboard, { compact = false }: { compact?: boolean } = {}): string {
  const file: DashboardFile = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    dashboard: {
      name: dashboard.name,
      period: dashboard.period,
      nodes: dashboard.nodes.map((node) => ({ id: node.id, type: node.type, position: node.position, data: node.data })),
      edges: dashboard.edges.map((edge) => ({ source: edge.source, target: edge.target })),
    },
  };
  return JSON.stringify(file, null, compact ? undefined : 2);
}

/** "dashboard-visao-da-empresa-no-mes.json". */
export function exportFileName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `dashboard-${slug || 'sem-nome'}.json`;
}

// ---------- Validação (o arquivo pode vir de qualquer lugar) ----------

type Record_ = Record<string, unknown>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : fallback;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function textList(value: unknown, max: number, pattern?: RegExp): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.length <= 300 && (!pattern || pattern.test(item)))
    .slice(0, max);
}

function textMap(value: unknown, keys: string[]): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    keys.flatMap((key) => (typeof value[key] === 'string' ? [[key, (value[key] as string).slice(0, 300)]] : [])),
  );
}

const PRESETS = ['dashboard', ...PERIOD_OPTIONS.map((option) => option.value)] as const;

function period(value: unknown, fallback: PeriodConfig, allowDashboard: boolean): PeriodConfig {
  if (!isRecord(value)) return fallback;
  const preset = oneOf(value.preset, PRESETS, fallback.preset);
  if (preset === 'dashboard' && !allowDashboard) return fallback;
  const date = (item: unknown) => (typeof item === 'string' && isDateKey(item) ? item : null);
  return { preset, from: date(value.from), to: date(value.to) };
}

/** Chaves de projeto do Jira (ex: CLI, ECHO_2). */
export const PROJECT_KEY = /^[A-Za-z][A-Za-z0-9_]{0,49}$/;
/** accountId do Jira (ex: 5b10ac8d82e05b22cc7d4ef5, 557058:f58131cb-…). */
const ACCOUNT_ID = /^[\w:-]{1,128}$/;

function projects(value: unknown): ProjectChoice {
  if (value === null) return null;
  return textList(value, 200, PROJECT_KEY);
}

function people(value: unknown): PeopleChoice {
  // Arquivos de antes da escolha de pessoas: 'all' | 'me'.
  if (value === 'me') return { mode: 'me', accountIds: [], names: {} };
  if (!isRecord(value)) return allPeople();
  const mode = oneOf(value.mode, ['all', 'chosen', 'me'] as const, 'all');
  const accountIds = mode === 'chosen' ? textList(value.accountIds, 500, ACCOUNT_ID) : [];
  return { mode, accountIds, names: textMap(value.names, accountIds) };
}

const DIMENSIONS = new Set([...WORKLOG_SCHEMA.dimensions, ...ISSUE_SCHEMA.dimensions].map((dimension) => dimension.id));
const MEASURES = new Set([...WORKLOG_SCHEMA.measures, ...ISSUE_SCHEMA.measures].map((measure) => measure.id));

function dimension(value: unknown): string | null {
  return typeof value === 'string' && DIMENSIONS.has(value) ? value : null;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function heat(value: unknown): HeatColors | undefined {
  if (!isRecord(value)) return undefined;
  const ranges = (Array.isArray(value.ranges) ? value.ranges : [])
    .filter(isRecord)
    .flatMap((range) => {
      const upTo = range.upTo === null ? null : typeof range.upTo === 'number' && Number.isFinite(range.upTo) && range.upTo >= 0 ? range.upTo : undefined;
      return upTo !== undefined && typeof range.color === 'string' && HEX_COLOR.test(range.color) ? [{ upTo, color: range.color }] : [];
    })
    .slice(0, 8);
  return { mode: oneOf(value.mode, ['mono', 'custom'] as const, 'mono'), ranges };
}

/**
 * A configuração de uma peça, campo a campo: o que não é válido volta ao padrão
 * da peça. Vale para arquivos importados e para o que a IA devolve.
 */
export function parsePieceConfig(kind: PieceKind, value: unknown): unknown {
  const data = isRecord(value) ? value : {};
  switch (kind) {
    case 'worklogs': {
      const base = defaultConfig('worklogs');
      return {
        period: period(data.period, base.period, true),
        projectKeys: projects(data.projectKeys),
        people: people(data.people),
        jql: text(data.jql, '', 2000),
      } satisfies WorklogsConfig;
    }
    case 'issues': {
      const base = defaultConfig('issues');
      return {
        projectKeys: projects(data.projectKeys),
        selection: oneOf(data.selection, ISSUE_SELECTIONS.map((option) => option.value), base.selection),
        period: period(data.period, base.period, true),
        assignee: people(data.assignee),
        jql: text(data.jql, '', 2000),
      } satisfies IssuesConfig;
    }
    case 'filter': {
      const values = textList(data.values, 1000);
      return {
        field: dimension(data.field),
        mode: oneOf(data.mode, ['include', 'exclude'] as const, 'include'),
        values,
        labels: textMap(data.labels, values),
      } satisfies FilterConfig;
    }
    case 'group': {
      const base = defaultConfig('group');
      return {
        by: dimension(data.by),
        series: dimension(data.series),
        measure: typeof data.measure === 'string' && MEASURES.has(data.measure) ? data.measure : base.measure,
      } satisfies GroupConfig;
    }
    case 'sort': {
      const limit = typeof data.limit === 'number' && Number.isInteger(data.limit) && data.limit > 0 && data.limit <= 1000 ? data.limit : null;
      return {
        order: oneOf(data.order, SORT_ORDERS.map((option) => option.value), 'value-desc'),
        limit,
        others: data.others === true,
      } satisfies SortConfig;
    }
    default: {
      const base = defaultConfig(kind);
      const visual: VisualConfig = {
        title: text(data.title, '', 120),
        width: oneOf(data.width, ['quarter', 'third', 'half', 'full'] as const, base.width),
        measure: typeof data.measure === 'string' && MEASURES.has(data.measure) ? data.measure : null,
      };
      const colors = kind === 'heatmap' ? heat(data.heat) : undefined;
      return colors ? { ...visual, heat: colors } : visual;
    }
  }
}

function coordinate(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(-100_000, Math.min(100_000, value)) : 0;
}

/** Por que um arquivo não é um dashboard válido (o que vai pelas conexões; cada lado mostra a própria mensagem). */
export type ImportErrorCode = 'not-json' | 'not-dashboard' | 'newer-version' | 'no-pieces';

export const IMPORT_ERRORS: Record<ImportErrorCode, string> = {
  'not-json': 'O arquivo não é um JSON válido.',
  'not-dashboard': 'O arquivo não é um dashboard exportado pelo Dashboard.',
  'newer-version': 'O arquivo é de uma versão mais nova do Dashboard. Atualize a página e tente de novo.',
  'no-pieces': 'O arquivo não tem nenhuma peça que dê para usar.',
};

export type ImportResult = { ok: true; dashboard: ImportedDashboard } | { ok: false; code: ImportErrorCode; error: string };

function failure(code: ImportErrorCode): ImportResult {
  return { ok: false, code, error: IMPORT_ERRORS[code] };
}

/** Lê um arquivo exportado pelo Dashboard, aproveitando o que for válido. */
export function parseDashboardFile(content: string): ImportResult {
  let file: unknown;
  try {
    file = JSON.parse(content);
  } catch {
    return failure('not-json');
  }
  if (!isRecord(file) || file.format !== FORMAT || !isRecord(file.dashboard)) {
    return failure('not-dashboard');
  }
  if (typeof file.version !== 'number' || file.version > VERSION) {
    return failure('newer-version');
  }

  const source = file.dashboard;
  const rawNodes = Array.isArray(source.nodes) ? source.nodes.slice(0, MAX_NODES) : [];
  const rawEdges = Array.isArray(source.edges) ? source.edges.slice(0, MAX_EDGES) : [];
  let skipped = (Array.isArray(source.nodes) ? source.nodes.length : 0) - rawNodes.length;

  const nodes: BuilderNode[] = [];
  const ids = new Set<string>();
  for (const raw of rawNodes) {
    // `Object.hasOwn`, não `in`: "constructor", "toString"… passariam e derrubariam o quadro.
    const isKnownKind = isRecord(raw) && typeof raw.type === 'string' && Object.hasOwn(PIECES, raw.type);
    if (!isRecord(raw) || typeof raw.id !== 'string' || ids.has(raw.id) || !isKnownKind) {
      skipped++;
      continue;
    }
    const kind = raw.type as PieceKind;
    const position = isRecord(raw.position) ? raw.position : {};
    ids.add(raw.id);
    nodes.push({
      id: raw.id,
      type: kind,
      position: { x: coordinate(position.x), y: coordinate(position.y) },
      data: parsePieceConfig(kind, raw.data),
    } as BuilderNode);
  }

  // Uma entrada por peça (a última ligação vale), só entre peças que existem e que têm saída e entrada.
  const kindOf = new Map(nodes.map((node) => [node.id, node.type]));
  const byTarget = new Map<string, BuilderEdge>();
  for (const raw of rawEdges) {
    const sourceKind = isRecord(raw) && typeof raw.source === 'string' ? kindOf.get(raw.source) : undefined;
    const targetKind = isRecord(raw) && typeof raw.target === 'string' ? kindOf.get(raw.target) : undefined;
    if (!sourceKind || !targetKind || raw.source === raw.target || !PIECES[sourceKind].hasOutput || !PIECES[targetKind].accepts) {
      skipped++;
      continue;
    }
    byTarget.set(raw.target as string, { id: `e-${byTarget.size}`, source: raw.source as string, target: raw.target as string });
  }

  if (nodes.length === 0) return failure('no-pieces');
  return {
    ok: true,
    dashboard: {
      name: text(source.name, 'Dashboard importado', 60).trim() || 'Dashboard importado',
      period: period(source.period, DEFAULT_DASHBOARD_PERIOD, false),
      nodes,
      edges: [...byTarget.values()],
      skipped,
    },
  };
}

/** Peças de dados do dashboard importado: cada uma é uma busca no Jira, com a conta de quem importa. */
export function sourceCount(dashboard: ImportedDashboard): number {
  return dashboard.nodes.filter((node) => PIECES[node.type].category === 'source').length;
}

/** Peças de visualização do dashboard importado (para a mensagem de sucesso). */
export function blockCount(dashboard: ImportedDashboard): number {
  return dashboard.nodes.filter((node) => isVisualKind(node.type)).length;
}
