import type { ReactNode } from 'react';
import styles from './BarList.module.css';

export interface BarListItem {
  id: string;
  label: ReactNode;
  /** Em segundos: o comprimento da barra. */
  value: number;
  /** Valor escrito na ponta (todas as linhas têm o número; a barra só compara). */
  valueLabel: string;
  detail?: string;
  /** `accent` (padrão) ou `muted` (contexto, ex: outros projetos). */
  tone?: 'accent' | 'muted';
}

/** Barras horizontais com o rótulo em cima e o valor escrito, da maior para a menor. */
export function BarList({ items, label }: { items: BarListItem[]; label: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ol className={styles.list} aria-label={label}>
      {items.map((item) => (
        <li key={item.id} className={styles.item}>
          <div className={styles.line}>
            <span className={styles.label}>{item.label}</span>
            <span className={styles.value}>
              {item.valueLabel}
              {item.detail && <span className={styles.detail}>{item.detail}</span>}
            </span>
          </div>
          <span className={styles.track} aria-hidden>
            <span className={styles.bar} data-tone={item.tone ?? 'accent'} style={{ width: `${(item.value / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ol>
  );
}
