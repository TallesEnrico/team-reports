import type {
  BuilderNode,
  Dataset,
  IssueSelection,
  PeopleChoice,
  PeriodConfig,
  ProjectChoice,
  SortOrder,
  SourceKind,
  VisualConfig,
  VisualKind,
} from '../types';
import { formatList, lowerFirst } from './format';
import { periodLabel, rangeLabel } from './periods';
import { ISSUE_SCHEMA, measureOf, WORKLOG_SCHEMA } from './schema';

const ALL_DIMENSIONS = [...WORKLOG_SCHEMA.dimensions, ...ISSUE_SCHEMA.dimensions];
const ALL_MEASURES = [...WORKLOG_SCHEMA.measures, ...ISSUE_SCHEMA.measures];

export function dimensionLabel(id: string | null): string {
  return ALL_DIMENSIONS.find((dimension) => dimension.id === id)?.label ?? '';
}

export function measureLabel(id: string | null | undefined, source?: SourceKind): string {
  if (source) return measureOf(source, id).label;
  return ALL_MEASURES.find((measure) => measure.id === id)?.label ?? '';
}

export const ISSUE_SELECTIONS: { value: IssueSelection; label: string }[] = [
  { value: 'open', label: 'Abertas agora' },
  { value: 'done', label: 'Concluídas no período' },
  { value: 'created', label: 'Criadas no período' },
  { value: 'updated', label: 'Atualizadas no período' },
];

export const SORT_ORDERS: { value: SortOrder; label: string }[] = [
  { value: 'value-desc', label: 'Maior primeiro' },
  { value: 'value-asc', label: 'Menor primeiro' },
  { value: 'label', label: 'Pelo nome (ou data)' },
];

/** "Todas as squads", "Minha squad (CLI)", "Squads CLI, ECHO +2". */
export function projectsLabel(projectKeys: ProjectChoice, connectedSquad: string | undefined): string {
  if (projectKeys === null) return connectedSquad ? `Minha squad (${connectedSquad})` : 'Minha squad';
  if (projectKeys.length === 0) return 'Todas as squads';
  const shown = projectKeys.slice(0, 3).join(', ');
  return `${projectKeys.length === 1 ? 'Squad' : 'Squads'} ${projectKeys.length > 3 ? `${shown} +${projectKeys.length - 3}` : shown}`;
}

/** "Todas as pessoas", "Ana Ribeiro e Bruno Carvalho", "Ana Ribeiro +3", "Só as minhas horas". */
export function peopleLabel(choice: PeopleChoice, mine: string): string {
  if (choice.mode === 'me') return mine;
  if (choice.mode === 'all') return 'Todas as pessoas';
  const names = choice.accountIds.map((accountId) => choice.names[accountId] ?? 'Pessoa sem nome');
  if (names.length === 0) return 'Nenhuma pessoa escolhida';
  if (names.length <= 2) return formatList(names);
  return `${names[0]} +${names.length - 1}`;
}

/** Período de uma peça de dados: o próprio, ou o do dashboard (dito assim, para saber que ele muda junto). */
function sourcePeriodLabel(period: PeriodConfig, dashboardPeriod: PeriodConfig): string {
  return period.preset === 'dashboard' ? `${periodLabel(dashboardPeriod)} (do dashboard)` : periodLabel(period);
}

/** Título automático de um bloco: "Horas lançadas por pessoa", "Issues por status e responsável". */
export function autoTitle(kind: VisualKind, config: VisualConfig, data: Dataset | undefined): string {
  if (!data) return '';
  if (data.kind === 'records') {
    if (kind === 'table') return data.source === 'worklogs' ? 'Apontamentos' : 'Issues';
    return measureOf(data.source, config.measure).label;
  }
  const measure = measureOf(data.source, data.spec.measure).label;
  if (kind === 'number' || !data.spec.by) return measure;
  const by = lowerFirst(dimensionLabel(data.spec.by));
  const series = data.spec.series ? ` e ${lowerFirst(dimensionLabel(data.spec.series))}` : '';
  return `${measure} por ${by}${series}`;
}

export function widgetTitle(kind: VisualKind, config: VisualConfig, data: Dataset | undefined): string {
  return config.title.trim() || autoTitle(kind, config, data);
}

interface SummaryContext {
  connectedSquad: string | undefined;
  dashboardPeriod: PeriodConfig;
  /** Fonte dos dados que chegam na peça, quando já se sabe. */
  source: SourceKind | undefined;
  data: Dataset | undefined;
}

/** Resumo da configuração, na própria peça. */
export function summarize(node: BuilderNode, context: SummaryContext): string {
  switch (node.type) {
    case 'worklogs': {
      const config = node.data;
      return [
        sourcePeriodLabel(config.period, context.dashboardPeriod),
        projectsLabel(config.projectKeys, context.connectedSquad),
        peopleLabel(config.people, 'Só as minhas horas'),
        config.jql.trim() ? 'JQL a mais' : '',
      ]
        .filter(Boolean)
        .join(' · ');
    }
    case 'issues': {
      const config = node.data;
      const selection = ISSUE_SELECTIONS.find((option) => option.value === config.selection)?.label ?? '';
      return [
        config.selection === 'open'
          ? selection
          : `${selection.replace(' no período', '')}: ${lowerFirst(sourcePeriodLabel(config.period, context.dashboardPeriod))}`,
        projectsLabel(config.projectKeys, context.connectedSquad),
        config.assignee.mode === 'all' ? '' : peopleLabel(config.assignee, 'Só as minhas'),
        config.jql.trim() ? 'JQL a mais' : '',
      ]
        .filter(Boolean)
        .join(' · ');
    }
    case 'filter': {
      const config = node.data;
      if (!config.field) return 'Escolha o campo a filtrar';
      if (config.values.length === 0) return `${dimensionLabel(config.field)}: escolha os valores`;
      const labels = config.values.map((value) => config.labels[value] ?? value);
      const shown = labels.slice(0, 2).join(', ') + (labels.length > 2 ? ` +${labels.length - 2}` : '');
      return `${config.mode === 'include' ? 'Só' : 'Sem'} ${lowerFirst(dimensionLabel(config.field))}: ${shown}`;
    }
    case 'group': {
      const config = node.data;
      const measure = measureLabel(config.measure, context.source);
      if (!config.by) return `${measure}: total`;
      const series = config.series ? ` × ${lowerFirst(dimensionLabel(config.series))}` : '';
      return `${measure} por ${lowerFirst(dimensionLabel(config.by))}${series}`;
    }
    case 'sort': {
      const config = node.data;
      const order = SORT_ORDERS.find((option) => option.value === config.order)?.label ?? '';
      if (config.limit === null) return order;
      return `${order}, só os ${config.limit} primeiros${config.others ? ' e "Outros"' : ''}`;
    }
    default:
      return widgetTitle(node.type, node.data, context.data) || 'Bloco do dashboard';
  }
}

/** A peça de dados de onde vêm os dados de uma peça (seguindo as entradas para trás). */
export function sourceNodeOf(nodeId: string, nodes: BuilderNode[], edges: { source: string; target: string }[]): BuilderNode | undefined {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  let current = byId.get(nodeId);
  while (current && !seen.has(current.id)) {
    if (current.type === 'worklogs' || current.type === 'issues') return current;
    seen.add(current.id);
    const id = current.id;
    const input = edges.find((edge) => edge.target === id)?.source;
    current = input ? byId.get(input) : undefined;
  }
  return undefined;
}

/** De onde e de quando são os números de um bloco: "01/10 a 03/10 · Squad CLI · Só as minhas horas". */
export function dataMeta(source: BuilderNode | undefined, data: Dataset | undefined, connectedSquad: string | undefined): string[] {
  const meta: string[] = [];
  if (data?.period) meta.push(rangeLabel(data.period));
  if (source?.type === 'worklogs') {
    meta.push(projectsLabel(source.data.projectKeys, connectedSquad));
    if (source.data.people.mode !== 'all') meta.push(peopleLabel(source.data.people, 'Só as minhas horas'));
  } else if (source?.type === 'issues') {
    if (source.data.selection === 'open') meta.push('Issues abertas');
    meta.push(projectsLabel(source.data.projectKeys, connectedSquad));
    if (source.data.assignee.mode !== 'all') meta.push(peopleLabel(source.data.assignee, 'Só as minhas'));
  }
  return meta;
}

/** A fonte dos dados de uma peça, pela montagem (vale enquanto a busca ainda não terminou). */
export function sourceKindOf(nodeId: string, nodes: BuilderNode[], edges: { source: string; target: string }[]): SourceKind | undefined {
  const source = sourceNodeOf(nodeId, nodes, edges);
  return source?.type === 'worklogs' || source?.type === 'issues' ? source.type : undefined;
}
