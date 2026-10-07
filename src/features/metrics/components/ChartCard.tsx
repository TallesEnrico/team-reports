import { type ReactNode, useId, useState } from 'react';
import { cx } from '../../../lib/cx';
import styles from './ChartCard.module.css';

export interface LegendEntry {
  label: string;
  /** Forma da marca, igual à do gráfico (`danger`, `alert`, `success`, `empty`: as faixas dos dias). */
  swatch: 'bar' | 'muted-bar' | 'line' | 'missing' | 'danger' | 'alert' | 'success' | 'empty';
}

interface ChartCardProps {
  title: string;
  subtitle?: ReactNode;
  /** Duas séries ou mais; uma série só dispensa legenda (o título diz o que é). */
  legend?: LegendEntry[];
  /** Os mesmos números em tabela: alternativa ao gráfico (leitor de tela, impressão, conferência). */
  table?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Cartão de um gráfico: título, legenda e a troca entre gráfico e tabela. */
export function ChartCard({ title, subtitle, legend, table, className, children }: ChartCardProps) {
  const titleId = useId();
  const [view, setView] = useState<'chart' | 'table'>('chart');

  return (
    <figure className={cx(styles.card, className)} aria-labelledby={titleId}>
      <header className={styles.header}>
        <div className={styles.titles}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {table && (
          <div className={styles.toggle} role="group" aria-label="Ver como">
            <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')}>
              Gráfico
            </button>
            <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>
              Tabela
            </button>
          </div>
        )}
      </header>
      {legend && view === 'chart' && <ChartLegend entries={legend} />}
      <div className={styles.body}>{view === 'table' && table ? table : children}</div>
    </figure>
  );
}

export function ChartLegend({ entries }: { entries: LegendEntry[] }) {
  return (
    <ul className={styles.legend}>
      {entries.map((entry) => (
        <li key={entry.label}>
          <span className={styles.swatch} data-swatch={entry.swatch} aria-hidden />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

/** Tabela compacta da visão "Tabela" dos cartões. */
export function ChartTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row[0])}>
              {row.map((cell, index) => (index === 0 ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
