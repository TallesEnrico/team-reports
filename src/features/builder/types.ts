import type { Edge, Node } from '@xyflow/react';
import type { JiraIssue } from '../../api/jira-issues';
import type { JiraUser } from '../../api/jira-users';
import type { DateKey } from '../../lib/dates';

// ---------- Peças ----------

/** Peças de dados: buscam no Jira. */
export type SourceKind = 'worklogs' | 'issues';
/** Peças que transformam os dados que chegam. */
export type TransformKind = 'filter' | 'group' | 'sort';
/** Peças que viram um bloco do dashboard. */
export type VisualKind = 'number' | 'bars' | 'columns' | 'heatmap' | 'table';
export type PieceKind = SourceKind | TransformKind | VisualKind;
export type PieceCategory = 'source' | 'transform' | 'visual';

export type PeriodPreset =
  /** Só nas peças: segue o período do dashboard (o seletor do cabeçalho). */
  | 'dashboard'
  | 'this-week'
  | 'last-week'
  | 'this-month'
  | 'last-month'
  | 'last-7'
  | 'last-30'
  | 'last-90'
  | 'custom';

/** Período das peças de dados; `from`/`to` só valem com `custom`. */
export type PeriodConfig = {
  preset: PeriodPreset;
  from: DateKey | null;
  to: DateKey | null;
};

/** Squads (projetos do Jira): `[]` = todas; `null` = a squad da conta conectada (acompanha se ela mudar). */
export type ProjectChoice = string[] | null;

/**
 * De quem são os dados: todas as pessoas, as escolhidas (funcionários do Jira)
 * ou só a conta conectada. `names` guarda o nome de quem foi escolhido, para o
 * resumo da peça e para quem não lançou nada aparecer zerado.
 */
export type PeopleChoice = {
  mode: 'all' | 'chosen' | 'me';
  accountIds: string[];
  names: Record<string, string>;
};

export type WorklogsConfig = {
  period: PeriodConfig;
  projectKeys: ProjectChoice;
  /** De quem são os apontamentos. */
  people: PeopleChoice;
  /** JQL a mais, somada com AND (ex: `labels = backend`). */
  jql: string;
};

/** Quais issues entram: as abertas agora, ou as concluídas, criadas ou atualizadas no período. */
export type IssueSelection = 'open' | 'done' | 'created' | 'updated';

export type IssuesConfig = {
  projectKeys: ProjectChoice;
  selection: IssueSelection;
  period: PeriodConfig;
  /** De quem são as issues (responsável). */
  assignee: PeopleChoice;
  jql: string;
};

export type FilterConfig = {
  /** Campo (dimensão) filtrado; `null` = ainda sem filtro (os dados passam como estão). */
  field: string | null;
  mode: 'include' | 'exclude';
  values: string[];
  /** Rótulo de cada valor escolhido, para o resumo da peça antes dos dados chegarem. */
  labels: Record<string, string>;
};

export type GroupConfig = {
  /** `null` = um grupo só (o total). */
  by: string | null;
  /** "Cruzar com": a segunda dimensão (séries, colunas do mapa de calor). */
  series: string | null;
  measure: string;
};

export type SortOrder = 'value-desc' | 'value-asc' | 'label';

export type SortConfig = {
  order: SortOrder;
  /** Quantos grupos ficam; `null` = todos. */
  limit: number | null;
  /** Com limite: junta os outros grupos em "Outros". */
  others: boolean;
};

/** Largura do bloco no dashboard (grade de 12 colunas). */
export type WidgetWidth = 'quarter' | 'third' | 'half' | 'full';

/**
 * Faixa de cor do mapa de calor: os valores até `upTo` (na unidade da medida:
 * horas ou a contagem) ficam com `color`; `upTo: null` é a última, sem limite.
 */
export type HeatRange = { upTo: number | null; color: string };

/** Cores do mapa de calor: uma cor só, do claro ao escuro, ou faixas escolhidas pela pessoa. */
export type HeatColors = { mode: 'mono' | 'custom'; ranges: HeatRange[] };

export type VisualConfig = {
  /** Vazio = título automático (ex: "Horas por pessoa"). */
  title: string;
  width: WidgetWidth;
  /** Só no Número ligado a dados sem agrupar: o que contar. */
  measure: string | null;
  /** Só no Mapa de calor; sem ele, monocromático. */
  heat?: HeatColors;
};

export type PieceConfigs = {
  worklogs: WorklogsConfig;
  issues: IssuesConfig;
  filter: FilterConfig;
  group: GroupConfig;
  sort: SortConfig;
  number: VisualConfig;
  bars: VisualConfig;
  columns: VisualConfig;
  heatmap: VisualConfig;
  table: VisualConfig;
};

/** Peça no quadro de montagem (nó do React Flow); `type` diz qual é, `data`, a configuração. */
export type BuilderNode = { [Kind in PieceKind]: Node<PieceConfigs[Kind], Kind> }[PieceKind];
export type BuilderEdge = Edge;

export interface Dashboard {
  id: string;
  name: string;
  /** Período do dashboard: vale para as peças de dados que o seguem (`preset: 'dashboard'`). Nunca é `'dashboard'`. */
  period: PeriodConfig;
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  updatedAt: number;
}

export type BuilderMode = 'build' | 'view';

// ---------- Dados ----------

/** Issue das peças de dados, com o projeto e as datas no fuso da tela. */
export interface SourceIssue extends JiraIssue {
  projectKey: string;
  projectName: string;
  createdDate?: DateKey;
  updatedDate?: DateKey;
  /** Quando a issue foi para a categoria "Concluído" (só nas concluídas). */
  doneDate?: DateKey;
}

/** Um apontamento, com quem lançou e a issue dele. */
export interface WorklogRecord {
  id: string;
  /** Dia do início, no fuso da tela. */
  date: DateKey;
  seconds: number;
  comment: string;
  author: JiraUser;
  /** A squad em que a pessoa mais lançou horas nos dados buscados. */
  authorSquad?: { key: string; name: string };
  issue: SourceIssue;
}

export interface DateRange {
  from: DateKey;
  to: DateKey;
}

/** Valor de uma dimensão: a chave agrupa, o rótulo aparece. */
export interface DimValue {
  key: string;
  label: string;
  /** Ordem natural (datas, dias da semana, categorias de status); sem ela, a ordem é pelo valor. */
  order?: number | string;
  /** A issue (ou issue pai) do valor: o rótulo abre o modal dela. */
  issue?: JiraIssue;
}

/**
 * O que todo conjunto de dados carrega além dos registros: o período buscado, a
 * data a que ele se refere (`periodField`: `worklog`, `created`, `done`, `updated`)
 * e os filtros já aplicados (para os dias sem nada que um filtro de data tirou
 * não voltarem zerados nos gráficos).
 */
export interface DatasetContext {
  period?: DateRange;
  periodField?: string;
  filters?: FilterConfig[];
  /** As pessoas escolhidas na peça de dados: quem não tem nada aparece zerado nos grupos por pessoa. */
  roster?: { accountId: string; displayName: string }[];
}

export type RecordsDataset =
  | ({ kind: 'records'; source: 'worklogs'; records: WorklogRecord[] } & DatasetContext)
  | ({ kind: 'records'; source: 'issues'; records: SourceIssue[] } & DatasetContext);

export interface GroupSpec {
  by: string | null;
  series: string | null;
  measure: string;
}

/** Ordem e corte dos grupos (peça Ordenar). */
export interface CategoryOptions {
  order: SortOrder | 'natural';
  limit: number | null;
  others: boolean;
}

/** Dados agrupados: categorias (`by`) e, com "Cruzar com", séries; os registros continuam junto para recalcular. */
export interface AggregateDataset extends DatasetContext {
  kind: 'aggregate';
  source: SourceKind;
  spec: GroupSpec;
  options: CategoryOptions;
  records: WorklogRecord[] | SourceIssue[];
  /** Na ordem de exibição. */
  categories: DimValue[];
  /** Na ordem do total de cada série (maior primeiro); vazio sem "Cruzar com". */
  seriesList: DimValue[];
  /** Medida de cada categoria (calculada sobre os registros dela, não somando as séries). */
  values: Record<string, number>;
  /** Medida de cada categoria × série. */
  cells: Record<string, Record<string, number>>;
  seriesTotals: Record<string, number>;
  /** A medida sobre os grupos mostrados (com "Ordenar" limitando sem "Outros", só os primeiros). */
  total: number;
}

export type Dataset = RecordsDataset | AggregateDataset;

/** O que sai de uma peça. */
export type PieceResult =
  | { state: 'idle'; message: string; fix?: PieceFix }
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | {
      state: 'ready';
      data: Dataset;
      note?: string;
      /** Dados da busca anterior, na tela até a nova chegar (ex: depois de trocar o período). */
      isStale?: boolean;
    };

/** Ação sugerida numa peça que não pode mostrar nada ainda (ex: encaixar um "Agrupar" antes). */
export type PieceFix = 'insert-group';

/** Formato do que sai de uma peça: registros ou agrupado; `unknown` sem entrada. */
export type DataShape = 'records' | 'aggregate' | 'unknown';
