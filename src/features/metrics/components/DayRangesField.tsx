import { useId } from 'react';
import { DAY_RANGE_OPTIONS } from '../lib/dayRanges';
import { formatHours } from '../lib/format';
import type { DayRanges } from '../types';
import styles from './DayRangesField.module.css';

interface DayRangesFieldProps {
  ranges: DayRanges;
  onChange: (key: keyof DayRanges, seconds: number) => void;
}

const LIMITS: { key: keyof DayRanges; label: string }[] = [
  { key: 'danger', label: 'Abaixo de' },
  { key: 'alert', label: 'baixo de' },
  { key: 'success', label: 'até a jornada' },
];

/**
 * Jornada e faixas das horas de um dia útil (as cores dos dias na lista de
 * pessoas e no modal da pessoa). Mudar um limite empurra os outros (store).
 */
export function DayRangesField({ ranges, onChange }: DayRangesFieldProps) {
  const id = useId();
  const hasYellow = ranges.alert > ranges.danger;

  return (
    <fieldset className={styles.field}>
      <legend className={styles.label}>Jornada</legend>
      <div className={styles.rows}>
        <div className={styles.row}>
          <span className={styles.swatch} data-tone="empty" aria-hidden />
          <span className={styles.rowLabel}>Cinza: dia útil sem horas</span>
        </div>
        {LIMITS.map((limit) => (
          <div key={limit.key} className={styles.row}>
            <span className={styles.swatch} data-tone={limit.key} aria-hidden />
            <label htmlFor={`${id}-${limit.key}`} className={styles.rowLabel}>
              {limit.label}
            </label>
            <select
              id={`${id}-${limit.key}`}
              className={`input ${styles.select}`}
              value={ranges[limit.key]}
              onChange={(event) => onChange(limit.key, Number(event.target.value))}
            >
              {DAY_RANGE_OPTIONS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {formatHours(seconds)}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div className={styles.row}>
          <span className={styles.swatch} data-tone="over" aria-hidden />
          <span className={styles.rowLabel}>Azul acima da jornada</span>
        </div>
      </div>
      <p className={styles.hint}>
        A jornada é o esperado por dia útil.
        {!hasYellow && ' Sem faixa amarela: o limite dela é o mesmo do vermelho.'}
      </p>
    </fieldset>
  );
}
