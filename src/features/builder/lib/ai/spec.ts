import { isDateKey } from '../../../../lib/dates';
import type {
  BuilderEdge,
  BuilderNode,
  Dashboard,
  PeopleChoice,
  PeriodConfig,
  PieceKind,
  ProjectChoice,
  SourceKind,
  VisualConfig,
  VisualKind,
  WidgetWidth,
} from '../../types';
import { defaultConfig, isSourceKind, isVisualKind, PIECES } from '../catalog';
import { dashboardOrder, inputsOf, shapeOf } from '../graph';
import { PERIOD_OPTIONS } from '../periods';
import { schemaOf } from '../schema';
import { createNode, newEdge, newId } from '../templates';
import { parsePieceConfig, PROJECT_KEY } from '../transfer';
import { layoutPieces } from './layout';

// ---------- O formato que a IA lê e escreve ----------

/** Período: um atalho (`this-month`…), `dashboard` (só nas peças) ou um intervalo. */
export type AiPeriod = string | { from: string | null; to: string | null };

export interface AiPiece {
  id: string;
  type: PieceKind;
  /** A peça que alimenta esta (todas, menos as de dados). */
  input?: string;
  config: Record<string, unknown>;
}

export interface AiDashboardSpec {
  name: string;
  period: AiPeriod;
  pieces: AiPiece[];
}

/**
 * Escolhas da pessoa que não vão para a IA, trocadas por `ref:N`: squads e
 * pessoas escolhidas, JQL e valores de filtro (nomes, chaves de issue, status do
 * Jira). Quando a IA devolve o `ref:N`, a escolha volta como estava.
 */
type PrivateChoice =
  | { kind: 'squads'; value: string[] }
  | { kind: 'people'; value: PeopleChoice }
  | { kind: 'jql'; value: string }
  | { kind: 'filter'; field: string | null; values: string[]; labels: Record<string, string> };

export interface SpecContext {
  refs: Map<string, PrivateChoice>;
  /** Id de cada peça para a IA → id dela no dashboard: as peças que continuam mantêm o id. */
  ids: Map<string, { id: string; type: PieceKind }>;
}

export function emptySpecContext(): SpecContext {
  return { refs: new Map(), ids: new Map() };
}

/**
 * Valores de filtro que não são dados do Jira (os mesmos em qualquer site): vão
 * para a IA como estão, e ela pode escolher entre eles.
 */
export const FIXED_FILTER_VALUES: Record<string, Record<string, string>> = {
  statusCategory: { new: 'A fazer', indeterminate: 'Em andamento', done: 'Concluído' },
  estimate: { none: 'Sem estimativa', within: 'Dentro da estimativa', over: 'Acima da estimativa' },
  weekday: {
    '0': 'Segunda-feira',
    '1': 'Terça-feira',
    '2': 'Quarta-feira',
    '3': 'Quinta-feira',
    '4': 'Sexta-feira',
    '5': 'Sábado',
    '6': 'Domingo',
  },
};

/** Campos em que a IA pode escrever valores a partir do pedido (nomes que a pessoa citou, como "Bug"). */
const NAMED_FILTER_FIELDS = new Set(['type', 'status']);

// ---------- Dashboard → IA ----------

function aiPeriod(period: PeriodConfig): AiPeriod {
  return period.preset === 'custom' ? { from: period.from, to: period.to } : period.preset;
}

/**
 * As peças na ordem de leitura: as de dados primeiro, depois cada bloco do
 * dashboard (na ordem dele) precedido da cadeia que o alimenta, e por fim as que
 * não chegam a nenhum bloco. Toda peça vem depois da que a alimenta.
 */
function readingOrder(nodes: BuilderNode[], edges: BuilderEdge[]): BuilderNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const inputs = inputsOf(edges);
  const ordered: BuilderNode[] = [];
  const placed = new Set<string>();

  function place(id: string, trail = new Set<string>()) {
    if (placed.has(id) || trail.has(id) || !byId.has(id)) return;
    trail.add(id);
    const input = inputs.get(id);
    if (input) place(input, trail);
    placed.add(id);
    ordered.push(byId.get(id)!);
  }

  for (const node of dashboardOrder(nodes.filter((item) => isSourceKind(item.type)))) place(node.id);
  for (const node of dashboardOrder(nodes.filter((item) => isVisualKind(item.type)))) place(node.id);
  for (const node of nodes) place(node.id);
  return ordered;
}

/**
 * O dashboard no formato da IA, sem nenhum dado do Jira: as escolhas da pessoa
 * viram `ref:N` (o contexto guarda o que cada uma era).
 */
export function dashboardToSpec(dashboard: Dashboard): { spec: AiDashboardSpec; context: SpecContext } {
  const context = emptySpecContext();
  const ref = (choice: PrivateChoice) => {
    const id = `ref:${context.refs.size + 1}`;
    context.refs.set(id, choice);
    return id;
  };
  const squads = (projectKeys: ProjectChoice) =>
    projectKeys === null ? 'mine' : projectKeys.length === 0 ? 'all' : ref({ kind: 'squads', value: projectKeys });
  const people = (choice: PeopleChoice) =>
    choice.mode === 'chosen' ? ref({ kind: 'people', value: choice }) : choice.mode;
  const jql = (value: string) => (value.trim() ? { jql: ref({ kind: 'jql', value }) } : {});

  const ordered = readingOrder(dashboard.nodes, dashboard.edges);
  const aliases = new Map<string, string>();
  const counters = new Map<PieceKind, number>();
  for (const node of ordered) {
    const count = (counters.get(node.type) ?? 0) + 1;
    counters.set(node.type, count);
    const alias = `${node.type}${count}`;
    aliases.set(node.id, alias);
    context.ids.set(alias, { id: node.id, type: node.type });
  }

  const inputs = inputsOf(dashboard.edges);
  const pieces = ordered.map((node): AiPiece => {
    let config: Record<string, unknown>;
    switch (node.type) {
      case 'worklogs':
        config = {
          period: aiPeriod(node.data.period),
          squads: squads(node.data.projectKeys),
          people: people(node.data.people),
          ...jql(node.data.jql),
        };
        break;
      case 'issues':
        config = {
          selection: node.data.selection,
          period: aiPeriod(node.data.period),
          squads: squads(node.data.projectKeys),
          assignee: people(node.data.assignee),
          ...jql(node.data.jql),
        };
        break;
      case 'filter': {
        const { field, mode, values, labels } = node.data;
        const isFixed = field !== null && field in FIXED_FILTER_VALUES;
        config = {
          field,
          mode,
          values: isFixed || values.length === 0 ? values : ref({ kind: 'filter', field, values, labels }),
        };
        break;
      }
      case 'group':
        config = { by: node.data.by, series: node.data.series, measure: node.data.measure };
        break;
      case 'sort':
        config = { order: node.data.order, limit: node.data.limit, others: node.data.others };
        break;
      default: {
        // Título, largura, medida e cores do mapa de calor: nada disso vem do Jira.
        const { title, width, measure, heat } = node.data;
        config = { title, width, ...(measure ? { measure } : {}), ...(heat ? { heat } : {}) };
      }
    }
    const input = inputs.get(node.id);
    return {
      id: aliases.get(node.id)!,
      type: node.type,
      ...(input && aliases.has(input) ? { input: aliases.get(input)! } : {}),
      config,
    };
  });

  return { spec: { name: dashboard.name, period: aiPeriod(dashboard.period), pieces }, context };
}

/** O JSON do dashboard para a mensagem: uma peça por linha (legível e sem gastar contexto com recuo). */
export function formatSpec(spec: AiDashboardSpec, summary?: string): string {
  const pieces = spec.pieces.map((piece) => `    ${JSON.stringify(piece)}`).join(',\n');
  const lines = [`  "name": ${JSON.stringify(spec.name)}`, `  "period": ${JSON.stringify(spec.period)}`];
  if (summary) lines.push(`  "summary": ${JSON.stringify(summary)}`);
  lines.push(`  "pieces": [\n${pieces}\n  ]`);
  return `{\n${lines.join(',\n')}\n}`;
}

// ---------- IA → dashboard ----------

export interface SpecResult {
  name: string;
  period: PeriodConfig;
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  /** O que a IA disse que fez (vazio se ela não disse). */
  summary: string;
  /** Erros que a IA deve corrigir (vão para ela num segundo pedido). */
  problems: string[];
  /** O que foi corrigido aqui mesmo (avisado para a pessoa). */
  fixes: string[];
}

export interface ParseOptions {
  /** Corrige o que der e descarta o resto, em vez de só listar os problemas (a última tentativa). */
  autoFix: boolean;
  /** Nome e período quando a IA não manda (ao editar, os do dashboard). */
  fallbackName: string;
  fallbackPeriod: PeriodConfig;
}

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const PRESETS = new Set<string>(PERIOD_OPTIONS.map((option) => option.value).filter((value) => value !== 'custom'));

function parsePeriod(value: unknown, fallback: PeriodConfig, allowDashboard: boolean): PeriodConfig {
  if (typeof value === 'string') {
    if (value === 'dashboard') return allowDashboard ? { preset: 'dashboard', from: null, to: null } : fallback;
    return PRESETS.has(value) ? ({ preset: value, from: null, to: null } as PeriodConfig) : fallback;
  }
  if (isRecord(value)) {
    const date = (item: unknown) => (typeof item === 'string' && isDateKey(item) ? item : null);
    const from = date(value.from);
    const to = date(value.to);
    if (from && to && from <= to) return { preset: 'custom', from, to };
  }
  return fallback;
}

interface ParseState {
  context: SpecContext;
  options: ParseOptions;
  problems: string[];
  fixes: string[];
}

/** Um `ref:N` devolvido pela IA: a escolha guardada, se ele existe e é do tipo certo. */
function resolveRef<Kind extends PrivateChoice['kind']>(
  value: unknown,
  kind: Kind,
  where: string,
  state: ParseState,
): Extract<PrivateChoice, { kind: Kind }> | null | undefined {
  if (typeof value !== 'string' || !value.startsWith('ref:')) return undefined;
  const choice = state.context.refs.get(value);
  if (choice?.kind === kind) return choice as Extract<PrivateChoice, { kind: Kind }>;
  const message = `${where}: "${value}" não existe. Use só os ref que vieram no dashboard atual, na mesma propriedade; sem ref, use "all".`;
  if (state.options.autoFix) state.fixes.push(`${where}: uma escolha que não existia voltou ao padrão.`);
  else state.problems.push(message);
  return null;
}

function parseSquads(value: unknown, where: string, state: ParseState): ProjectChoice {
  const choice = resolveRef(value, 'squads', where, state);
  if (choice) return choice.value;
  if (typeof value === 'string' && /^(mine|minha|me|my)$/i.test(value)) return null;
  // Chaves de projeto que a pessoa citou no pedido (ex: "CLI").
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && PROJECT_KEY.test(item)).map((key) => key.toUpperCase());
  }
  return [];
}

function parsePeople(value: unknown, where: string, state: ParseState): PeopleChoice {
  const choice = resolveRef(value, 'people', where, state);
  if (choice) return choice.value;
  if (typeof value === 'string' && /^(me|mine|eu)$/i.test(value)) return { mode: 'me', accountIds: [], names: {} };
  return { mode: 'all', accountIds: [], names: {} };
}

function parseJql(value: unknown, where: string, state: ParseState): string {
  const choice = resolveRef(value, 'jql', where, state);
  if (choice) return choice.value;
  return typeof value === 'string' && !value.startsWith('ref:') ? value.replace(/\border\s+by\b[\s\S]*$/i, '').trim() : '';
}

/** A configuração no formato da IA → a do app (validada depois por `parsePieceConfig`). */
function toPieceConfig(kind: PieceKind, raw: unknown, where: string, state: ParseState): unknown {
  const config = isRecord(raw) ? raw : {};
  const piecePeriod = () => parsePeriod(config.period, { preset: 'dashboard', from: null, to: null }, true);
  switch (kind) {
    case 'worklogs':
      return {
        period: piecePeriod(),
        projectKeys: parseSquads(config.squads, where, state),
        people: parsePeople(config.people, where, state),
        jql: parseJql(config.jql, where, state),
      };
    case 'issues':
      return {
        selection: config.selection,
        period: piecePeriod(),
        projectKeys: parseSquads(config.squads, where, state),
        assignee: parsePeople(config.assignee ?? config.people, where, state),
        jql: parseJql(config.jql, where, state),
      };
    case 'filter': {
      const field = typeof config.field === 'string' ? config.field : null;
      const choice = resolveRef(config.values, 'filter', where, state);
      if (choice) return { field, mode: config.mode, values: choice.values, labels: choice.labels };
      const fixed = field ? FIXED_FILTER_VALUES[field] : undefined;
      const values = (Array.isArray(config.values) ? config.values : [])
        .map((value) => (typeof value === 'number' ? String(value) : value))
        .filter((value): value is string => typeof value === 'string' && (fixed ? value in fixed : NAMED_FILTER_FIELDS.has(field ?? '')));
      const labels = Object.fromEntries(values.map((value) => [value, fixed?.[value] ?? value]));
      return { field, mode: config.mode, values, labels };
    }
    default:
      // Agrupar, Ordenar e as de Mostrar usam o mesmo formato do app.
      return config;
  }
}

/** A peça de dados no começo da cadeia (para saber quais campos e medidas existem). */
function sourceOf(id: string, kinds: Map<string, PieceKind>, inputs: Map<string, string>): SourceKind | undefined {
  const seen = new Set<string>();
  for (let current: string | undefined = id; current && !seen.has(current); current = inputs.get(current)) {
    seen.add(current);
    const kind = kinds.get(current);
    if (kind === 'worklogs' || kind === 'issues') return kind;
  }
  return undefined;
}

/** O Agrupar mais próximo acima da peça (passando por Filtrar e Ordenar). */
function groupAbove(id: string, nodes: Map<string, BuilderNode>, inputs: Map<string, string>): BuilderNode | undefined {
  const seen = new Set<string>();
  for (let current = inputs.get(id); current && !seen.has(current); current = inputs.get(current)) {
    seen.add(current);
    const node = nodes.get(current);
    if (node?.type === 'group') return node;
    if (node?.type !== 'filter' && node?.type !== 'sort') return undefined;
  }
  return undefined;
}

const SOURCE_NAMES: Record<SourceKind, string> = { worklogs: 'worklogs (Horas lançadas)', issues: 'issues (Issues)' };

/** Colunas de cada largura na grade de 12 do dashboard, e a largura que divide uma linha por igual. */
const WIDTH_COLUMNS: Record<WidgetWidth, number> = { quarter: 3, third: 4, half: 6, full: 12 };
const EVEN_WIDTH: Record<number, WidgetWidth> = { 1: 'full', 2: 'half', 3: 'third', 4: 'quarter' };

/**
 * Fecha as linhas do dashboard que ficariam com sobra (ex: um gráfico "half"
 * sozinho antes de um "full"): os blocos da linha passam a dividi-la por igual.
 * Só nas linhas com alguma peça nova da IA; as que a pessoa já tinha ficam como estavam.
 */
function evenRows(visuals: BuilderNode[], isNew: (node: BuilderNode) => boolean): Map<BuilderNode, WidgetWidth> {
  const widths = new Map<BuilderNode, WidgetWidth>();
  let row: BuilderNode[] = [];
  let used = 0;
  const close = () => {
    const even = EVEN_WIDTH[row.length];
    if (used < 12 && even && row.some(isNew)) for (const node of row) widths.set(node, even);
    row = [];
    used = 0;
  };
  for (const node of visuals) {
    const columns = WIDTH_COLUMNS[(node.data as VisualConfig).width] ?? 12;
    if (used + columns > 12) close();
    row.push(node);
    used += columns;
    if (used === 12) close();
  }
  close();
  return widths;
}

/**
 * Lê o dashboard que a IA devolveu. Cada configuração passa pela mesma validação
 * dos arquivos importados; ligações, campos e medidas são conferidos contra a
 * fonte de cada cadeia. Sem `autoFix`, os erros voltam em `problems` (para a IA
 * corrigir); com ele, o que der é corrigido e o resto sai, com o aviso em `fixes`.
 */
export function specToDashboard(raw: unknown, context: SpecContext, options: ParseOptions): SpecResult {
  const state: ParseState = { context, options, problems: [], fixes: [] };
  const problem = (message: string, fix?: string) => {
    if (options.autoFix) {
      if (fix) state.fixes.push(fix);
    } else state.problems.push(message);
  };

  // Alguns modelos embrulham o dashboard ({"dashboard": {...}}).
  const root = isRecord(raw) && !Array.isArray(raw.pieces) && isRecord(raw.dashboard) ? raw.dashboard : raw;
  const spec = isRecord(root) ? root : {};
  const summarySource = isRecord(raw) && typeof raw.summary === 'string' ? raw.summary : spec.summary;
  const rawPieces = Array.isArray(spec.pieces) ? spec.pieces.slice(0, 80) : [];
  if (rawPieces.length === 0) state.problems.push('O JSON precisa de "pieces" com as peças do dashboard.');

  // Peças: id único, tipo conhecido e a configuração validada.
  const nodes = new Map<string, BuilderNode>();
  const kinds = new Map<string, PieceKind>();
  const requestedInputs = new Map<string, unknown>();
  const order: string[] = [];
  const realIds = new Map<string, string>();
  rawPieces.forEach((item, index) => {
    const piece = isRecord(item) ? item : {};
    let id = typeof piece.id === 'string' && piece.id.trim() ? piece.id.trim().slice(0, 60) : `peca${index + 1}`;
    while (kinds.has(id)) id = `${id}_${index + 1}`;
    if (typeof piece.type !== 'string' || !Object.hasOwn(PIECES, piece.type)) {
      problem(
        `Peça "${id}": "type" precisa ser um destes: ${Object.keys(PIECES).join(', ')}.`,
        `Uma peça de tipo desconhecido ("${String(piece.type)}") ficou de fora.`,
      );
      return;
    }
    const kind = piece.type as PieceKind;
    const previous = context.ids.get(id);
    const realId = previous?.type === kind ? previous.id : newId(kind);
    const rawConfig = isRecord(piece.config) ? piece.config : piece;
    const data = parsePieceConfig(kind, toPieceConfig(kind, rawConfig, `Peça "${id}"`, state)) as Raw;
    // Um campo que não existe em nenhuma fonte a validação do arquivo zera calada: aqui a IA fica sabendo.
    for (const key of kind === 'group' ? ['by', 'series'] : kind === 'filter' ? ['field'] : []) {
      if (typeof rawConfig[key] === 'string' && data[key] === null) {
        problem(`Peça "${id}": "${key}" = "${String(rawConfig[key])}" não é um campo.`, `Um campo desconhecido ("${String(rawConfig[key])}") ficou vazio.`);
      }
    }
    // Na validação, a peça usa o id da IA (o das ligações); o do dashboard entra no fim.
    nodes.set(id, createNode(kind, { x: 0, y: 0 }, data as never, id));
    kinds.set(id, kind);
    realIds.set(id, realId);
    order.push(id);
    if (!isSourceKind(kind)) requestedInputs.set(id, piece.input);
  });

  // Ligações: cada peça (menos as de dados) recebe de uma peça com saída.
  const inputs = new Map<string, string>();
  for (const [id, input] of requestedInputs) {
    const name = PIECES[kinds.get(id)!].name;
    if (typeof input !== 'string' || !kinds.has(input)) {
      problem(
        typeof input === 'string'
          ? `Peça "${id}": o input "${input}" não existe.`
          : `Peça "${id}" (${name}) precisa de "input": o id da peça que a alimenta.`,
        `A peça "${name}" ficou sem entrada.`,
      );
      continue;
    }
    if (input === id || !PIECES[kinds.get(input)!].hasOutput) {
      problem(`Peça "${id}": "${input}" não tem saída (as peças de Mostrar viram blocos e não alimentam outras).`);
      continue;
    }
    // Sem círculos: o input não pode depender desta peça.
    let loops = false;
    for (let current: string | undefined = input; current; current = inputs.get(current)) {
      if (current === id) {
        loops = true;
        break;
      }
    }
    if (loops) {
      problem(`Peça "${id}": ligar em "${input}" fecha um círculo.`);
      continue;
    }
    inputs.set(id, input);
  }

  const edgesOf = () => [...inputs].map(([target, source]) => ({ id: `${source}->${target}`, source, target }));

  // Formatos: Agrupar só recebe registros; Ordenar e os gráficos, dados agrupados.
  for (const id of [...order]) {
    const input = inputs.get(id);
    if (!input) continue;
    const kind = kinds.get(id)!;
    const shape = shapeOf(input, [...nodes.values()], edgesOf());
    const accepts = PIECES[kind].accepts!;
    if (shape === 'unknown' || accepts.includes(shape)) continue;
    const name = PIECES[kind].name;
    if (shape === 'records' && isVisualKind(kind)) {
      if (!options.autoFix) {
        state.problems.push(`Peça "${id}" (${kind}) precisa de dados agrupados: ponha um "group" entre "${input}" e ela.`);
        continue;
      }
      // Como no "+" do quadro: um Agrupar entra no meio, configurado para o gráfico.
      const groupId = `${id}_group`;
      const source = sourceOf(input, kinds, inputs);
      nodes.set(groupId, createNode('group', { x: 0, y: 0 }, defaultConfig('group', source, kind as VisualKind), groupId));
      kinds.set(groupId, 'group');
      realIds.set(groupId, newId('group'));
      order.splice(order.indexOf(id), 0, groupId);
      inputs.set(groupId, input);
      inputs.set(id, groupId);
      state.fixes.push(`Um "Agrupar e cruzar" entrou antes de "${name}", que precisa de dados agrupados.`);
      continue;
    }
    problem(
      shape === 'records'
        ? `Peça "${id}" (${kind}) só recebe dados agrupados: ligue ela num "group" (ou num "sort"/"filter" depois dele).`
        : `Peça "${id}" (${kind}) só recebe registros: ligue ela direto na peça de dados ou num "filter" ligado a ela.`,
      `A peça "${name}" ficou sem entrada (o formato dos dados não encaixava).`,
    );
    inputs.delete(id);
  }

  // Campos e medidas que existem na fonte de cada cadeia.
  for (const id of order) {
    const node = nodes.get(id)!;
    const source = sourceOf(id, kinds, inputs);
    if (!source) continue;
    const schema = schemaOf(source);
    const dimensionIds = schema.dimensions.map((dimension) => dimension.id);
    const measureIds = schema.measures.map((measure) => measure.id);
    const hasDimension = (value: string | null) => value === null || dimensionIds.includes(value);
    const where = `Peça "${id}"`;
    const fields = `Campos de ${SOURCE_NAMES[source]}: ${dimensionIds.join(', ')}.`;
    const measures = `Medidas de ${SOURCE_NAMES[source]}: ${measureIds.join(', ')}.`;
    if (node.type === 'group') {
      const data = { ...node.data };
      if (!hasDimension(data.by)) {
        problem(`${where}: "by" = "${data.by}" não existe. ${fields}`, `Um "Agrupar" com um campo que não existe nos dados ficou sem campo.`);
        data.by = null;
      }
      if (!hasDimension(data.series) || (data.series && data.series === data.by)) {
        problem(`${where}: "series" = "${data.series}" não existe ou repete o "by". ${fields}`);
        data.series = null;
      }
      if (!measureIds.includes(data.measure)) {
        problem(`${where}: "measure" = "${data.measure}" não existe. ${measures}`);
        data.measure = schema.defaultMeasure;
      }
      nodes.set(id, { ...node, data });
    } else if (node.type === 'filter' && node.data.field && !hasDimension(node.data.field)) {
      problem(`${where}: "field" = "${node.data.field}" não existe. ${fields}`, `Um "Filtrar" com um campo que não existe nos dados ficou sem filtro.`);
      nodes.set(id, { ...node, data: { ...node.data, field: null, values: [], labels: {} } });
    } else if (node.type === 'number' && node.data.measure && !measureIds.includes(node.data.measure)) {
      problem(`${where}: "measure" = "${node.data.measure}" não existe. ${measures}`);
      nodes.set(id, { ...node, data: { ...node.data, measure: schema.defaultMeasure } });
    }
  }

  // Mapa de calor: um Agrupar com os dois campos.
  for (const id of order) {
    if (kinds.get(id) !== 'heatmap' || !inputs.has(id)) continue;
    const group = groupAbove(id, nodes, inputs);
    if (group?.type === 'group' && group.data.by && group.data.series) continue;
    problem(`Peça "${id}" (heatmap) precisa de um "group" antes dela com "by" e "series" preenchidos.`);
  }

  // Com `autoFix`, peças sem entrada (que não são de dados) saem: ficariam soltas no quadro.
  const kept = options.autoFix ? order.filter((id) => isSourceKind(kinds.get(id)!) || inputs.has(id)) : order;
  const visuals = kept.filter((id) => isVisualKind(kinds.get(id)!));
  if (visuals.length === 0) state.problems.push('O dashboard precisa de pelo menos uma peça de mostrar (number, bars, columns, heatmap ou table).');

  const keptSet = new Set(kept);
  const edges = [...inputs]
    .filter(([target, source]) => keptSet.has(target) && keptSet.has(source))
    .map(([target, source]) => newEdge(realIds.get(source)!, realIds.get(target)!));
  const positions = layoutPieces(kept.map((id) => realIds.get(id)!), edges);

  const widths = evenRows(
    visuals.map((id) => nodes.get(id)!),
    (node) => context.ids.get(node.id)?.type !== node.type,
  );
  for (const [node, width] of widths) nodes.set(node.id, { ...node, data: { ...node.data, width } } as BuilderNode);

  const name = typeof spec.name === 'string' && spec.name.trim() ? spec.name.trim().slice(0, 60) : options.fallbackName;
  return {
    name,
    period: parsePeriod(spec.period, options.fallbackPeriod, false),
    nodes: kept.map((id) => {
      const realId = realIds.get(id)!;
      return { ...nodes.get(id)!, id: realId, position: positions.get(realId)! } as BuilderNode;
    }),
    edges,
    summary: typeof summarySource === 'string' ? summarySource.trim().slice(0, 600) : '',
    problems: state.problems,
    fixes: state.fixes,
  };
}
