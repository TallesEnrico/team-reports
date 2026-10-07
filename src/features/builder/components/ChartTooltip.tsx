import styles from './ChartTooltip.module.css';

export interface ChartTooltipRow {
  label: string;
  value: string;
  /** Cor da série, num traço ao lado do valor (a mesma marca do gráfico). */
  color?: string;
  /** Linha de total, separada das séries. */
  isTotal?: boolean;
}

/** Conteúdo dos tooltips dos gráficos: o valor em destaque e o nome da série depois. */
export function ChartTooltip({ title, rows }: { title: string; rows: ChartTooltipRow[] }) {
  return (
    <>
      <p className={styles.title}>{title}</p>
      <dl className={styles.rows}>
        {rows.map((row) => (
          <div key={row.label} className={styles.row} data-total={row.isTotal || undefined}>
            <dd className={styles.value}>
              {row.color && <span className={styles.mark} style={{ background: row.color }} aria-hidden />}
              {row.value}
            </dd>
            <dt className={styles.label}>{row.label}</dt>
          </div>
        ))}
      </dl>
    </>
  );
}
