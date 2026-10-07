import styles from './Segmented.module.css';

interface SegmentedProps<Value extends string> {
  label: string;
  value: Value;
  options: { value: Value; label: string }[];
  onChange: (value: Value) => void;
}

/** Escolha entre poucas opções, todas à vista (ex: "Todas as pessoas" / "Só as minhas horas"). */
export function Segmented<Value extends string>({ label, value, options, onChange }: SegmentedProps<Value>) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
