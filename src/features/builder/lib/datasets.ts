import { addDays, type DateKey, diffInDays } from '../../../lib/dates';
import type {
  AggregateDataset,
  CategoryOptions,
  Dataset,
  DatasetContext,
  DimValue,
  FilterConfig,
  GroupSpec,
  SortConfig,
  SourceIssue,
  SourceKind,
  WorklogRecord,
} from '../types';
import { type DimensionDef, dimensionOf, measureOf, timeValue } from './schema';

type AnyRecord = WorklogRecord | SourceIssue;

/** O que todo conjunto de dados carrega: a fonte, os registros, o período buscado e os filtros aplicados. */
interface DataBase extends DatasetContext {
  source: SourceKind;
  records: AnyRecord[];
}

export const TOTAL_KEY = '__total__';
export const OTHERS_KEY = '__others__';

const TOTAL: DimValue = { key: TOTAL_KEY, label: 'Total' };
const NATURAL: CategoryOptions = { order: 'natural', limit: null, others: false };

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

function baseOf(data: Dataset): DataBase {
  return {
    source: data.source,
    records: data.records,
    period: data.period,
    periodField: data.periodField,
    filters: data.filters,
    roster: data.roster,
  };
}

/** O campo de pessoa da fonte (quem lançou; nas issues, o responsável): as pessoas escolhidas aparecem nele. */
function isRosterField(base: DatasetContext & { source: SourceKind }, field: string): boolean {
  return Boolean(base.roster?.length) && field === (base.source === 'worklogs' ? 'person' : 'assignee');
}

/** As pessoas escolhidas na peça de dados, menos as que um filtro de pessoa tirou: quem não tem nada aparece zerado. */
function rosterValues(base: DataBase, field: string): DimValue[] {
  const personFilters = (base.filters ?? []).filter((filter) => filter.field === field && filter.values.length > 0);
  return (base.roster ?? [])
    .filter((person) => personFilters.every((filter) => filter.values.includes(person.accountId) === (filter.mode === 'include')))
    .map((person) => ({ key: person.accountId, label: person.displayName }));
}

/** Datas demais para preencher (ex: issues criadas ao longo de anos, por dia). */
const MAX_FILL_DAYS = 1100;

/**
 * Os dias (semanas, meses) sem nada que aparecem zerados num campo de data: os
 * do período buscado, se ele é dessa data (ex: horas lançadas por dia); senão,
 * do primeiro ao último registro (ex: issues abertas por semana de criação).
 * Os que um filtro da mesma data tirou (ex: sem fim de semana) não voltam.
 */
function fillValues(base: DataBase, dimension: DimensionDef<AnyRecord> | undefined): DimValue[] {
  if (dimension && isRosterField(base, dimension.id)) return rosterValues(base, dimension.id);
  if (!dimension?.time || !dimension.dateOf) return [];
  let range = base.period && base.periodField === dimension.dateField ? base.period : undefined;
  if (!range) {
    let from: DateKey | undefined;
    let to: DateKey | undefined;
    for (const record of base.records) {
      const date = dimension.dateOf(record);
      if (!date) continue;
      if (!from || date < from) from = date;
      if (!to || date > to) to = date;
    }
    range = from && to ? { from, to } : undefined;
  }
  if (!range || diffInDays(range.from, range.to) > MAX_FILL_DAYS) return [];

  const dateFilters = (base.filters ?? []).flatMap((filter) => {
    const filterDimension = dimensionOf(base.source, filter.field);
    return filterDimension?.fromDate && filterDimension.dateField === dimension.dateField && filter.values.length > 0
      ? [{ fromDate: filterDimension.fromDate, keys: new Set(filter.values), include: filter.mode === 'include' }]
      : [];
  });
  const values = new Map<string, DimValue>();
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
    if (!dateFilters.every((filter) => filter.keys.has(filter.fromDate(day).key) === filter.include)) continue;
    const value = timeValue(dimension.time, day);
    if (!values.has(value.key)) values.set(value.key, value);
  }
  return [...values.values()];
}

/** Ordem natural de uma dimensão: a `order` dos valores (datas, situação) e, sem ela, o rótulo. */
function compareNatural(a: DimValue, b: DimValue): number {
  if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
    return typeof a.order === 'number' && typeof b.order === 'number'
      ? a.order - b.order
      : collator.compare(String(a.order), String(b.order));
  }
  // Valores vazios ("Sem responsável") vão para o fim.
  if (!a.key !== !b.key) return a.key ? -1 : 1;
  return collator.compare(a.label, b.label);
}

interface Bucket {
  value: DimValue;
  records: AnyRecord[];
  measure: number;
}

function bucketize(records: AnyRecord[], dimension: DimensionDef<AnyRecord> | undefined, fill: DimValue[]): Map<string, Bucket> {
  const buckets = new Map<string, Bucket>();
  for (const value of fill) buckets.set(value.key, { value, records: [], measure: 0 });
  for (const record of records) {
    const value = dimension ? dimension.get(record) : TOTAL;
    let bucket = buckets.get(value.key);
    if (!bucket) {
      bucket = { value, records: [], measure: 0 };
      buckets.set(value.key, bucket);
    }
    bucket.records.push(record);
  }
  return buckets;
}

function sortBuckets(buckets: Bucket[], order: CategoryOptions['order'], natural: boolean): Bucket[] {
  const byValue = (direction: 1 | -1) => (a: Bucket, b: Bucket) =>
    direction * (a.measure - b.measure) || compareNatural(a.value, b.value);
  const sorted = [...buckets];
  if (order === 'value-desc' || (order === 'natural' && !natural)) return sorted.sort(byValue(-1));
  if (order === 'value-asc') return sorted.sort(byValue(1));
  return sorted.sort((a, b) => compareNatural(a.value, b.value));
}

/**
 * Agrupa os registros pela dimensão `by` (e, com `series`, cruza com a segunda),
 * medindo cada grupo. Campos de data preenchem os dias (semanas, meses) do período
 * sem nada. `seriesLimit` junta as séries menores em "Outras" (cores dos gráficos).
 */
export function aggregate(
  base: DataBase,
  spec: GroupSpec,
  options: CategoryOptions = NATURAL,
  seriesLimit?: number,
): AggregateDataset {
  const by = dimensionOf(base.source, spec.by);
  const series = dimensionOf(base.source, spec.series);
  const measure = measureOf(base.source, spec.measure);

  const categoryBuckets = [...bucketize(base.records, by, fillValues(base, by)).values()];
  for (const bucket of categoryBuckets) bucket.measure = measure.reduce(bucket.records);
  let ordered = sortBuckets(categoryBuckets, options.order, Boolean(by?.natural));

  if (options.limit !== null && ordered.length > options.limit) {
    const rest = ordered.slice(options.limit);
    ordered = ordered.slice(0, options.limit);
    // Os dias preenchidos sem nada não contam como grupo em "Outros".
    const withData = rest.filter((bucket) => bucket.records.length > 0).length;
    if (options.others && withData > 0) {
      const records = rest.flatMap((bucket) => bucket.records);
      ordered.push({
        value: { key: OTHERS_KEY, label: `Outros (${withData})` },
        records,
        measure: measure.reduce(records),
      });
    }
  }

  // Os grupos mostrados: com "Ordenar" limitando sem "Outros", só os primeiros (o total também).
  const visibleRecords = ordered.flatMap((bucket) => bucket.records);

  // Séries: as maiores primeiro (ou na ordem natural, nas datas); as menores viram "Outras".
  let seriesList: DimValue[] = [];
  const seriesTotals: Record<string, number> = {};
  const seriesKeyOf = new Map<string, string>();
  if (series) {
    const seriesBuckets = [...bucketize(visibleRecords, series, fillValues(base, series)).values()];
    for (const bucket of seriesBuckets) bucket.measure = measure.reduce(bucket.records);
    let sortedSeries = sortBuckets(seriesBuckets, 'natural', Boolean(series.natural));
    if (seriesLimit !== undefined && sortedSeries.length > seriesLimit) {
      // Ficam as maiores (não as primeiras: nas datas, seriam sempre as mais antigas), na ordem de antes.
      const kept = new Set([...sortedSeries].sort((a, b) => b.measure - a.measure).slice(0, seriesLimit - 1));
      const rest = sortedSeries.filter((bucket) => !kept.has(bucket));
      const records = rest.flatMap((bucket) => bucket.records);
      sortedSeries = sortedSeries.filter((bucket) => kept.has(bucket));
      const withData = rest.filter((bucket) => bucket.records.length > 0).length;
      if (withData > 0) {
        sortedSeries.push({ value: { key: OTHERS_KEY, label: `Outras (${withData})` }, records, measure: measure.reduce(records) });
      }
      for (const bucket of rest) seriesKeyOf.set(bucket.value.key, OTHERS_KEY);
    }
    seriesList = sortedSeries.map((bucket) => bucket.value);
    for (const bucket of sortedSeries) seriesTotals[bucket.value.key] = bucket.measure;
  }

  const values: Record<string, number> = {};
  const cells: Record<string, Record<string, number>> = {};
  for (const bucket of ordered) {
    values[bucket.value.key] = bucket.measure;
    if (!series) continue;
    const bySeries = new Map<string, AnyRecord[]>();
    for (const record of bucket.records) {
      const raw = series.get(record).key;
      const key = seriesKeyOf.get(raw) ?? raw;
      const list = bySeries.get(key);
      if (list) list.push(record);
      else bySeries.set(key, [record]);
    }
    cells[bucket.value.key] = Object.fromEntries([...bySeries].map(([key, records]) => [key, measure.reduce(records)]));
  }

  return {
    kind: 'aggregate',
    source: base.source,
    spec,
    options,
    records: base.records as AggregateDataset['records'],
    period: base.period,
    periodField: base.periodField,
    filters: base.filters,
    roster: base.roster,
    categories: ordered.map((bucket) => bucket.value),
    seriesList,
    values,
    cells,
    seriesTotals,
    total: measure.reduce(visibleRecords),
  };
}

/** As mesmas categorias, com as séries além de `limit` juntas em "Outras" (para colorir). */
export function withSeriesLimit(data: AggregateDataset, limit: number): AggregateDataset {
  if (data.seriesList.length <= limit) return data;
  return aggregate(baseOf(data), data.spec, data.options, limit);
}

/**
 * Valores de um campo nos dados, com quantos registros têm cada um (opções do
 * Filtrar). Campos de data listam também os valores do período sem nenhum
 * registro (ex: sábado e domingo sem horas), para dar para tirá-los dos gráficos.
 */
export function distinctValues(data: Dataset, field: string): { value: DimValue; count: number }[] {
  const dimension = dimensionOf(data.source, field);
  if (!dimension) return [];
  const counts = new Map<string, { value: DimValue; count: number }>();
  const { period } = data;
  if (dimension.fromDate && period && data.periodField === dimension.dateField && diffInDays(period.from, period.to) <= MAX_FILL_DAYS) {
    for (let day = period.from; day <= period.to; day = addDays(day, 1)) {
      const value = dimension.fromDate(day);
      if (!counts.has(value.key)) counts.set(value.key, { value, count: 0 });
    }
  }
  if (isRosterField(data, field)) {
    for (const person of data.roster ?? []) {
      if (!counts.has(person.accountId)) {
        counts.set(person.accountId, { value: { key: person.accountId, label: person.displayName }, count: 0 });
      }
    }
  }
  for (const record of data.records as AnyRecord[]) {
    const value = dimension.get(record);
    const entry = counts.get(value.key);
    if (entry) entry.count++;
    else counts.set(value.key, { value, count: 1 });
  }
  const entries = [...counts.values()];
  return dimension.natural
    ? entries.sort((a, b) => compareNatural(a.value, b.value))
    : entries.sort((a, b) => b.count - a.count || compareNatural(a.value, b.value));
}

/** Só os registros com (ou sem) os valores escolhidos; agrupado, agrupa de novo do mesmo jeito. */
export function filterDataset(data: Dataset, config: FilterConfig): Dataset {
  const dimension = dimensionOf(data.source, config.field);
  if (!dimension || config.values.length === 0) return data;
  const chosen = new Set(config.values);
  const keep = (record: AnyRecord) => chosen.has(dimension.get(record).key) === (config.mode === 'include');
  const records = (data.records as AnyRecord[]).filter(keep);
  const filters = [...(data.filters ?? []), config];
  if (data.kind === 'aggregate') return aggregate({ ...baseOf(data), records, filters }, data.spec, data.options);
  return { ...data, records, filters } as Dataset;
}

export function sortDataset(data: AggregateDataset, config: SortConfig): AggregateDataset {
  return aggregate(baseOf(data), data.spec, { order: config.order, limit: config.limit, others: config.others });
}

/** Agrupa registros (peça Agrupar). */
export function groupDataset(data: Dataset, spec: GroupSpec): AggregateDataset {
  return aggregate(baseOf(data), spec);
}
