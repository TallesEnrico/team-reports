import { formatValue } from '../lib/format';
import { measureOf } from '../lib/schema';
import type { Dataset, VisualConfig } from '../types';
import styles from './NumberView.module.css';

/** O número de um bloco "Número": a medida sobre os registros, ou o total do agrupado. */
export function numberOf(data: Dataset, config: VisualConfig): { value: number; formatted: string; label: string } {
  const measure = measureOf(data.source, data.kind === 'aggregate' ? data.spec.measure : config.measure);
  const value =
    data.kind === 'aggregate'
      ? data.total
      : (measure.reduce as (records: Dataset['records']) => number)(data.records);
  return { value, formatted: formatValue(value, measure.unit), label: measure.label };
}

interface NumberViewProps {
  data: Dataset;
  config: VisualConfig;
  size?: 'large' | 'small';
}

export function NumberView({ data, config, size = 'large' }: NumberViewProps) {
  const { formatted, label } = numberOf(data, config);
  return (
    <p className={styles.number} data-size={size} title={label}>
      {formatted}
    </p>
  );
}
