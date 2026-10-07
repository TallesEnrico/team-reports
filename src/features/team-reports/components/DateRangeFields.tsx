import { useId } from 'react';
import { FormField } from '../../../components/FormField';
import { addDays, type DateKey, endOfMonth, isoWeekRange, startOfMonth, todayKey } from '../../../lib/dates';
import styles from './DateRangeFields.module.css';

interface DateRange {
  from: DateKey;
  to: DateKey;
}

interface DateRangeFieldsProps extends DateRange {
  onChange: (range: Partial<DateRange>) => void;
}

function buildPresets(today: DateKey): { label: string; range: DateRange }[] {
  const thisWeek = isoWeekRange(today);
  const lastMonthDay = addDays(startOfMonth(today), -1);
  return [
    { label: 'Esta semana', range: thisWeek },
    { label: 'Semana passada', range: isoWeekRange(addDays(thisWeek.from, -7)) },
    { label: 'Este mês', range: { from: startOfMonth(today), to: endOfMonth(today) } },
    { label: 'Mês passado', range: { from: startOfMonth(lastMonthDay), to: lastMonthDay } },
  ];
}

export function DateRangeFields({ from, to, onChange }: DateRangeFieldsProps) {
  const fromId = useId();
  const toId = useId();
  const presets = buildPresets(todayKey());

  return (
    <div className={styles.wrapper}>
      <div className={styles.inputs}>
        <FormField label="De" htmlFor={fromId}>
          <input id={fromId} className="input" type="date" required value={from} onChange={(e) => onChange({ from: e.target.value })} />
        </FormField>
        <FormField label="Até" htmlFor={toId}>
          <input id={toId} className="input" type="date" required value={to} onChange={(e) => onChange({ to: e.target.value })} />
        </FormField>
      </div>
      <div className="relative">
        <div className="flex flex-row overflow-x-auto gap-1" role="group" aria-label="Períodos rápidos">
          <div className="right-0 absolute h-full w-4 bg-linear-to-l from-surface to-transparent" />
          {presets.map(({ label, range }) => {
            const isActive = range.from === from && range.to === to;
            return (
              <button
                key={label}
                type="button"
                className={isActive ? `${styles.preset} ${styles.presetActive} text-nowrap leading-none py-2!` : `${styles.preset} text-nowrap leading-none py-2!`}
                aria-pressed={isActive}
                onClick={() => onChange(range)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
