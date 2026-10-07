import type { ReactNode } from 'react';
import { formatDateBR } from '../../../lib/dates';
import { formatDuration } from '../../../lib/formatDuration';
import { formatValue, plural } from '../lib/format';
import { measureOf } from '../lib/schema';
import { dimensionLabel } from '../lib/describe';
import type { AggregateDataset, Dataset, SourceIssue, WorklogRecord } from '../types';
import styles from './DataTable.module.css';
import { DimLabel } from './DimLabel';

interface DataTableProps {
  data: Dataset;
  /** Linhas mostradas; as demais ficam só na contagem. */
  maxRows?: number;
}

/** Séries viram colunas até este número; acima, a tabela fica em linhas (grupo, série, valor). */
const MAX_PIVOT_COLUMNS = 12;

/** Os números em linhas e colunas: registros (apontamentos, issues) ou o agrupado. */
export function DataTable({ data, maxRows = 300 }: DataTableProps) {
  if (data.kind === 'aggregate') return <AggregateTable data={data} maxRows={maxRows} />;
  return data.source === 'worklogs' ? (
    <WorklogsTable records={data.records} maxRows={maxRows} />
  ) : (
    <IssuesTable records={data.records} maxRows={maxRows} />
  );
}

function TableFrame({ head, children, total, shown }: { head: ReactNode; children: ReactNode; total: number; shown: number }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.scroller}>
        <table className={styles.table}>
          <thead>{head}</thead>
          {children}
        </table>
      </div>
      {total > shown && (
        <p className={styles.more}>
          Mostrando {plural(shown, 'linha', 'linhas')} de {total}. Filtre ou agrupe para ver menos.
        </p>
      )}
    </div>
  );
}

function hours(seconds: number | undefined): string {
  return seconds ? formatDuration(seconds, 'hours-minutes') : '—';
}

function WorklogsTable({ records, maxRows }: { records: WorklogRecord[]; maxRows: number }) {
  // Os mais recentes primeiro.
  const rows = [...records].reverse().slice(0, maxRows);
  return (
    <TableFrame
      total={records.length}
      shown={rows.length}
      head={
        <tr>
          <th scope="col">Dia</th>
          <th scope="col">Pessoa</th>
          <th scope="col">Issue</th>
          <th scope="col" className={styles.number}>
            Horas
          </th>
          <th scope="col">Descrição</th>
        </tr>
      }
    >
      <tbody>
        {rows.map((record) => (
          <tr key={record.id}>
            <td className={styles.mono}>{formatDateBR(record.date)}</td>
            <td className={styles.nowrap}>{record.author.displayName}</td>
            <td className={styles.issueCell}>
              <DimLabel value={{ key: record.issue.key, label: `${record.issue.key} ${record.issue.summary}`, issue: record.issue }} />
            </td>
            <td className={styles.number}>{hours(record.seconds)}</td>
            <td className={styles.comment} title={record.comment}>
              {record.comment || '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </TableFrame>
  );
}

function IssuesTable({ records, maxRows }: { records: SourceIssue[]; maxRows: number }) {
  const rows = records.slice(0, maxRows);
  return (
    <TableFrame
      total={records.length}
      shown={rows.length}
      head={
        <tr>
          <th scope="col">Issue</th>
          <th scope="col">Status</th>
          <th scope="col">Responsável</th>
          <th scope="col" className={styles.number}>
            Estimativa
          </th>
          <th scope="col" className={styles.number}>
            Lançado
          </th>
          <th scope="col" className={styles.number}>
            Restante
          </th>
        </tr>
      }
    >
      <tbody>
        {rows.map((issue) => {
          const isOver = Boolean(issue.originalEstimateSeconds) && issue.timeSpentSeconds > (issue.originalEstimateSeconds ?? 0);
          return (
            <tr key={issue.id}>
              <td className={styles.issueCell}>
                <DimLabel value={{ key: issue.key, label: `${issue.key} ${issue.summary}`, issue }} />
              </td>
              <td className={styles.nowrap}>{issue.status.name}</td>
              <td className={styles.nowrap}>{issue.assignee?.displayName ?? 'Sem responsável'}</td>
              <td className={styles.number}>{hours(issue.originalEstimateSeconds)}</td>
              <td className={styles.number} data-over={isOver || undefined}>
                {hours(issue.timeSpentSeconds)}
              </td>
              <td className={styles.number}>{hours(issue.remainingEstimateSeconds)}</td>
            </tr>
          );
        })}
      </tbody>
    </TableFrame>
  );
}

function AggregateTable({ data, maxRows }: { data: AggregateDataset; maxRows: number }) {
  const { unit, label: measureLabel } = measureOf(data.source, data.spec.measure);
  const byLabel = data.spec.by ? dimensionLabel(data.spec.by) : 'Grupo';
  const rows = data.categories.slice(0, maxRows);
  const format = (value: number | undefined) => (value ? formatValue(value, unit) : '—');

  // Sem cruzamento: grupo e valor.
  if (data.seriesList.length === 0) {
    return (
      <TableFrame
        total={data.categories.length}
        shown={rows.length}
        head={
          <tr>
            <th scope="col">{byLabel}</th>
            <th scope="col" className={styles.number}>
              {measureLabel}
            </th>
          </tr>
        }
      >
        <tbody>
          {rows.map((category) => (
            <tr key={category.key}>
              <th scope="row" className={styles.labelCell}>
                <DimLabel value={category} />
              </th>
              <td className={styles.number}>{format(data.values[category.key])}</td>
            </tr>
          ))}
        </tbody>
        {data.spec.by && (
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className={styles.number}>{format(data.total)}</td>
            </tr>
          </tfoot>
        )}
      </TableFrame>
    );
  }

  const seriesLabel = data.spec.series ? dimensionLabel(data.spec.series) : 'Série';

  // Muitas séries: uma linha por grupo e série.
  if (data.seriesList.length > MAX_PIVOT_COLUMNS) {
    const pairs = data.categories.flatMap((category) =>
      data.seriesList
        .filter((series) => data.cells[category.key]?.[series.key])
        .map((series) => ({ category, series, value: data.cells[category.key][series.key] })),
    );
    const shown = pairs.slice(0, maxRows);
    return (
      <TableFrame
        total={pairs.length}
        shown={shown.length}
        head={
          <tr>
            <th scope="col">{byLabel}</th>
            <th scope="col">{seriesLabel}</th>
            <th scope="col" className={styles.number}>
              {measureLabel}
            </th>
          </tr>
        }
      >
        <tbody>
          {shown.map(({ category, series, value }) => (
            <tr key={`${category.key}|${series.key}`}>
              <th scope="row" className={styles.labelCell}>
                <DimLabel value={category} />
              </th>
              <td className={styles.labelCell}>
                <DimLabel value={series} />
              </td>
              <td className={styles.number}>{format(value)}</td>
            </tr>
          ))}
        </tbody>
      </TableFrame>
    );
  }

  return (
    <TableFrame
      total={data.categories.length}
      shown={rows.length}
      head={
        <tr>
          <th scope="col">
            {byLabel} / {seriesLabel.toLowerCase()}
          </th>
          {data.seriesList.map((series) => (
            <th key={series.key} scope="col" className={styles.number} title={series.label}>
              <span className={styles.seriesHead}>{series.label}</span>
            </th>
          ))}
          <th scope="col" className={styles.number}>
            Total
          </th>
        </tr>
      }
    >
      <tbody>
        {rows.map((category) => (
          <tr key={category.key}>
            <th scope="row" className={styles.labelCell}>
              <DimLabel value={category} />
            </th>
            {data.seriesList.map((series) => (
              <td key={series.key} className={styles.number}>
                {format(data.cells[category.key]?.[series.key])}
              </td>
            ))}
            <td className={styles.number} data-strong>
              {format(data.values[category.key])}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">Total</th>
          {data.seriesList.map((series) => (
            <td key={series.key} className={styles.number}>
              {format(data.seriesTotals[series.key])}
            </td>
          ))}
          <td className={styles.number}>{format(data.total)}</td>
        </tr>
      </tfoot>
    </TableFrame>
  );
}
