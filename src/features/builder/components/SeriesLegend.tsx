import type { DimValue } from '../types';
import styles from './SeriesLegend.module.css';

interface SeriesLegendProps {
  series: DimValue[];
  colorOf: (series: DimValue, index: number) => string;
}

/** Legenda das séries ("Cruzar com"): a cor nunca é o único jeito de saber qual é qual. */
export function SeriesLegend({ series, colorOf }: SeriesLegendProps) {
  return (
    <ul className={styles.legend}>
      {series.map((value, index) => (
        <li key={value.key} title={value.label}>
          <span className={styles.swatch} style={{ background: colorOf(value, index) }} aria-hidden />
          <span className={styles.label}>{value.label}</span>
        </li>
      ))}
    </ul>
  );
}
