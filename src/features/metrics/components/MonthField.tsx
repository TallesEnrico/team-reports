import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { Button } from '../../../components/Button';
import { addMonths, formatMonthLong } from '../lib/months';
import type { MonthKey } from '../types';
import styles from './MonthField.module.css';

/** Meses oferecidos na lista, do mais recente para trás; as setas vão além. */
const LISTED_MONTHS = 36;

interface MonthFieldProps {
  id: string;
  value: MonthKey;
  /** O mês mais recente que dá para escolher (o atual). */
  max: MonthKey;
  onChange: (month: MonthKey) => void;
}

/** Escolha do mês com setas para o anterior e o seguinte (o `<input type="month">` não existe no Safari). */
export function MonthField({ id, value, max, onChange }: MonthFieldProps) {
  const count = Math.max(LISTED_MONTHS, monthsBetween(value, max) + 1);
  const options = Array.from({ length: count }, (_, index) => addMonths(max, -index));

  return (
    <div className={styles.field}>
      <Button
        variant="secondary"
        icon={<CaretLeft size={14} weight="bold" aria-hidden />}
        aria-label="Mês anterior"
        title="Mês anterior"
        onClick={() => onChange(addMonths(value, -1))}
      />
      <select id={id} className={`input ${styles.select}`} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((month) => (
          <option key={month} value={month}>
            {capitalize(formatMonthLong(month))}
          </option>
        ))}
      </select>
      <Button
        variant="secondary"
        icon={<CaretRight size={14} weight="bold" aria-hidden />}
        aria-label="Mês seguinte"
        title="Mês seguinte"
        disabled={value >= max}
        onClick={() => onChange(addMonths(value, 1))}
      />
    </div>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function monthsBetween(from: MonthKey, to: MonthKey): number {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}
