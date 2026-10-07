import { overEstimateSeconds } from '../../../api/jira-issues';
import {
  type DateKey,
  formatDayMonth,
  formatShortMonth,
  formatWeekdayLong,
  isoWeekNumber,
  isoWeekStart,
  weekdayOf,
} from '../../../lib/dates';
import { parentToIssue } from '../../../lib/parentIssue';
import type { DimValue, SourceIssue, SourceKind, WorklogRecord } from '../types';
import type { MeasureUnit } from './format';

/** Campo para agrupar, cruzar e filtrar. */
export interface DimensionDef<R> {
  id: string;
  label: string;
  /** Datas, dias da semana, situação: os grupos seguem a ordem natural em vez do valor. */
  natural?: boolean;
  /** Campo de data: os dias (semanas, meses) sem nada aparecem zerados dentro do período. */
  time?: TimeGrain;
  /**
   * Campos que vêm de uma data: qual data (`worklog`, `created`, `done`), a data de
   * cada registro e o valor de uma data qualquer (para preencher os dias sem nada
   * e saber quais deles um filtro de data tirou).
   */
  dateField?: string;
  dateOf?: (record: R) => DateKey | undefined;
  fromDate?: (date: DateKey) => DimValue;
  get: (record: R) => DimValue;
}

/** O que se mede em cada grupo. */
export interface MeasureDef<R> {
  id: string;
  label: string;
  unit: MeasureUnit;
  /** A medida de um grupo é a soma das partes (horas, contagens); contagens distintas não são. */
  additive: boolean;
  reduce: (records: R[]) => number;
}

export interface SourceSchema<R> {
  dimensions: DimensionDef<R>[];
  measures: MeasureDef<R>[];
  defaultMeasure: string;
  /** "apontamento" / "apontamentos". */
  noun: [string, string];
}

export type TimeGrain = 'day' | 'week' | 'month';

// ---------- Datas ----------

/** Segunda = 0 … domingo = 6. */
function mondayIndex(date: DateKey): number {
  return (weekdayOf(date) + 6) % 7;
}

function monthLabel(month: string): string {
  return `${formatShortMonth(`${month}-01`)}/${month.slice(2, 4)}`;
}

const NO_DATE: DimValue = { key: '', label: 'Sem data', order: '9999' };

function weekdayValue(date: DateKey): DimValue {
  return { key: String(mondayIndex(date)), label: formatWeekdayLong(date), order: mondayIndex(date) };
}

/** Campo de data (dia, semana, mês) de uma das datas do registro. */
function timeDimension<R>(
  id: string,
  label: string,
  grain: TimeGrain,
  dateField: string,
  dateOf: (record: R) => DateKey | undefined,
): DimensionDef<R> {
  return {
    id,
    label,
    natural: true,
    time: grain,
    dateField,
    dateOf,
    fromDate: (date) => timeValue(grain, date),
    get: (record) => timeValue(grain, dateOf(record)),
  };
}

export function timeValue(grain: TimeGrain, date: DateKey | undefined): DimValue {
  if (!date) return NO_DATE;
  if (grain === 'day') return { key: date, label: formatDayMonth(date), order: date };
  if (grain === 'week') {
    const start = isoWeekStart(date);
    return { key: start, label: `Sem. ${isoWeekNumber(start)} (${formatDayMonth(start)})`, order: start };
  }
  const month = date.slice(0, 7);
  return { key: month, label: monthLabel(month), order: month };
}

// ---------- Campos da issue ----------

const STATUS_CATEGORIES: Record<string, { label: string; order: number }> = {
  new: { label: 'A fazer', order: 0 },
  indeterminate: { label: 'Em andamento', order: 1 },
  done: { label: 'Concluído', order: 2 },
};

function estimateState(issue: SourceIssue): DimValue {
  if (!issue.originalEstimateSeconds) return { key: 'none', label: 'Sem estimativa', order: 0 };
  if (overEstimateSeconds(issue) > 0) return { key: 'over', label: 'Acima da estimativa', order: 2 };
  return { key: 'within', label: 'Dentro da estimativa', order: 1 };
}

function issueDimensions<R>(issueOf: (record: R) => SourceIssue): DimensionDef<R>[] {
  return [
    {
      // No app, cada squad é um projeto do Jira.
      id: 'project',
      label: 'Squad',
      get: (record) => {
        const issue = issueOf(record);
        return { key: issue.projectKey, label: issue.projectName || issue.projectKey };
      },
    },
    {
      id: 'issue',
      label: 'Issue',
      get: (record) => {
        const issue = issueOf(record);
        return { key: issue.key, label: `${issue.key} ${issue.summary}`, issue };
      },
    },
    {
      id: 'parent',
      label: 'Issue pai',
      get: (record) => {
        const { parent } = issueOf(record);
        return parent
          ? { key: parent.key, label: `${parent.key} ${parent.summary}`, issue: parentToIssue(parent) }
          : { key: '', label: 'Sem issue pai' };
      },
    },
    {
      id: 'type',
      label: 'Tipo de issue',
      get: (record) => {
        const { issueType } = issueOf(record);
        return { key: issueType.name, label: issueType.name || 'Sem tipo' };
      },
    },
    {
      id: 'status',
      label: 'Status',
      get: (record) => {
        const { status } = issueOf(record);
        return { key: status.name, label: status.name || 'Sem status' };
      },
    },
    {
      id: 'statusCategory',
      label: 'Situação',
      natural: true,
      get: (record) => {
        const category = STATUS_CATEGORIES[issueOf(record).status.categoryKey ?? ''];
        return category
          ? { key: issueOf(record).status.categoryKey!, label: category.label, order: category.order }
          : { key: '', label: 'Sem situação', order: 9 };
      },
    },
    {
      id: 'assignee',
      label: 'Responsável',
      get: (record) => {
        const { assignee } = issueOf(record);
        return assignee ? { key: assignee.accountId, label: assignee.displayName } : { key: '', label: 'Sem responsável' };
      },
    },
    {
      id: 'priority',
      label: 'Prioridade',
      natural: true,
      get: (record) => {
        const { priority } = issueOf(record);
        // No esquema padrão do Jira, o id cresce da mais alta para a mais baixa.
        return priority
          ? { key: priority.id, label: priority.name, order: Number(priority.id) || 0 }
          : { key: '', label: 'Sem prioridade', order: Infinity };
      },
    },
    { id: 'estimate', label: 'Estimativa', natural: true, get: (record) => estimateState(issueOf(record)) },
  ];
}

// ---------- Horas lançadas ----------

function distinct<R>(records: R[], keyOf: (record: R) => string): number {
  return new Set(records.map(keyOf)).size;
}

function sumSeconds(records: WorklogRecord[]): number {
  let total = 0;
  for (const record of records) total += record.seconds;
  return total;
}

const personDay = (record: WorklogRecord) => `${record.author.accountId}|${record.date}`;

export const WORKLOG_SCHEMA: SourceSchema<WorklogRecord> = {
  noun: ['apontamento', 'apontamentos'],
  defaultMeasure: 'hours',
  dimensions: [
    {
      id: 'person',
      label: 'Pessoa',
      get: (record) => ({ key: record.author.accountId, label: record.author.displayName }),
    },
    {
      id: 'personSquad',
      label: 'Squad da pessoa',
      get: (record) =>
        record.authorSquad
          ? { key: record.authorSquad.key, label: record.authorSquad.name || record.authorSquad.key }
          : { key: '', label: 'Sem squad' },
    },
    timeDimension<WorklogRecord>('day', 'Dia', 'day', 'worklog', (record) => record.date),
    timeDimension<WorklogRecord>('week', 'Semana', 'week', 'worklog', (record) => record.date),
    timeDimension<WorklogRecord>('month', 'Mês', 'month', 'worklog', (record) => record.date),
    {
      id: 'weekday',
      label: 'Dia da semana',
      natural: true,
      dateField: 'worklog',
      dateOf: (record) => record.date,
      fromDate: weekdayValue,
      get: (record) => weekdayValue(record.date),
    },
    ...issueDimensions<WorklogRecord>((record) => record.issue),
  ],
  measures: [
    { id: 'hours', label: 'Horas lançadas', unit: 'duration', additive: true, reduce: sumSeconds },
    { id: 'worklogs', label: 'Apontamentos', unit: 'count', additive: true, reduce: (records) => records.length },
    {
      id: 'issues',
      label: 'Issues com horas',
      unit: 'count',
      additive: false,
      reduce: (records) => distinct(records, (record) => record.issue.id),
    },
    {
      id: 'squads',
      label: 'Squads com horas',
      unit: 'count',
      additive: false,
      reduce: (records) => distinct(records, (record) => record.issue.projectKey),
    },
    {
      id: 'people',
      label: 'Pessoas que lançaram',
      unit: 'count',
      additive: false,
      reduce: (records) => distinct(records, (record) => record.author.accountId),
    },
    {
      id: 'days',
      label: 'Dias com lançamento',
      unit: 'count',
      additive: false,
      reduce: (records) => distinct(records, personDay),
    },
    {
      id: 'average',
      label: 'Média por dia lançado',
      unit: 'duration',
      additive: false,
      reduce: (records) => {
        const days = distinct(records, personDay);
        return days ? sumSeconds(records) / days : 0;
      },
    },
  ],
};

// ---------- Issues ----------

function sumOf(records: SourceIssue[], valueOf: (issue: SourceIssue) => number | undefined): number {
  let total = 0;
  for (const record of records) total += valueOf(record) ?? 0;
  return total;
}

export const ISSUE_SCHEMA: SourceSchema<SourceIssue> = {
  noun: ['issue', 'issues'],
  defaultMeasure: 'count',
  dimensions: [
    ...issueDimensions<SourceIssue>((issue) => issue),
    timeDimension<SourceIssue>('createdWeek', 'Criada (semana)', 'week', 'created', (issue) => issue.createdDate),
    timeDimension<SourceIssue>('createdMonth', 'Criada (mês)', 'month', 'created', (issue) => issue.createdDate),
    timeDimension<SourceIssue>('doneWeek', 'Concluída (semana)', 'week', 'done', (issue) => issue.doneDate),
    timeDimension<SourceIssue>('doneMonth', 'Concluída (mês)', 'month', 'done', (issue) => issue.doneDate),
  ],
  measures: [
    { id: 'count', label: 'Issues', unit: 'count', additive: true, reduce: (records) => records.length },
    {
      id: 'spent',
      label: 'Tempo lançado',
      unit: 'duration',
      additive: true,
      reduce: (records) => sumOf(records, (issue) => issue.timeSpentSeconds),
    },
    {
      id: 'estimate',
      label: 'Estimativa original',
      unit: 'duration',
      additive: true,
      reduce: (records) => sumOf(records, (issue) => issue.originalEstimateSeconds),
    },
    {
      id: 'remaining',
      label: 'Tempo restante',
      unit: 'duration',
      additive: true,
      reduce: (records) => sumOf(records, (issue) => issue.remainingEstimateSeconds),
    },
    {
      id: 'over',
      label: 'Excedente da estimativa',
      unit: 'duration',
      additive: true,
      reduce: (records) => sumOf(records, overEstimateSeconds),
    },
    {
      id: 'overCount',
      label: 'Issues acima da estimativa',
      unit: 'count',
      additive: true,
      reduce: (records) => records.filter((issue) => overEstimateSeconds(issue) > 0).length,
    },
  ],
};

// ---------- Acesso ----------

type AnySchema = SourceSchema<WorklogRecord> | SourceSchema<SourceIssue>;
type AnyRecord = WorklogRecord | SourceIssue;

/**
 * O esquema de uma fonte, com os registros vistos de forma genérica: quem chama
 * passa sempre os registros da mesma fonte (o conjunto de dados diz qual é).
 */
export function schemaOf(source: SourceKind): SourceSchema<AnyRecord> {
  const schema: AnySchema = source === 'worklogs' ? WORKLOG_SCHEMA : ISSUE_SCHEMA;
  return schema as unknown as SourceSchema<AnyRecord>;
}

export function dimensionOf(source: SourceKind, id: string | null): DimensionDef<AnyRecord> | undefined {
  return id ? schemaOf(source).dimensions.find((dimension) => dimension.id === id) : undefined;
}

/** A medida pedida ou, se ela não existe nesta fonte, a padrão. */
export function measureOf(source: SourceKind, id: string | null | undefined): MeasureDef<AnyRecord> {
  const schema = schemaOf(source);
  return (
    schema.measures.find((measure) => measure.id === id) ??
    schema.measures.find((measure) => measure.id === schema.defaultMeasure)!
  );
}
