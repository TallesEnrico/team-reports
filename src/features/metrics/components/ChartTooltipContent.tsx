import styles from './ChartTooltipContent.module.css';

export interface TooltipRow {
  label: string;
  value: string;
  /** Traço da série ao lado do valor (mesma marca do gráfico). */
  mark?: 'bar' | 'muted-bar' | 'line' | 'missing' | 'danger' | 'alert' | 'success' | 'empty';
}

interface ChartTooltipContentProps {
  title: string;
  rows: TooltipRow[];
  note?: string;
}

/** Conteúdo dos tooltips dos gráficos: o valor em destaque e o nome da série depois. */
export function ChartTooltipContent({ title, rows, note }: ChartTooltipContentProps) {
  return (
    <>
      <p className={styles.title}>{title}</p>
      <dl className={styles.rows}>
        {rows.map((row) => (
          <div key={row.label} className={styles.row}>
            <dd className={styles.value}>
              {row.mark && <span className={styles.mark} data-mark={row.mark} aria-hidden />}
              {row.value}
            </dd>
            <dt className={styles.label}>{row.label}</dt>
          </div>
        ))}
      </dl>
      {note && <p className={styles.note}>{note}</p>}
    </>
  );
}
