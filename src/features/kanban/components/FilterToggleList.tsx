import { Check } from '@phosphor-icons/react';
import type { FilterOption } from '../lib/boardView';
import styles from './FilterToggleList.module.css';

interface FilterToggleListProps {
  legend: string;
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  emptyText: string;
}

/** Lista de opções liga/desliga com a contagem de cards de cada uma. */
export function FilterToggleList({ legend, options, selected, onChange, emptyText }: FilterToggleListProps) {
  const selectedSet = new Set(selected);

  function toggle(id: string) {
    onChange(selectedSet.has(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  }

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{legend}</legend>
      {options.length === 0 ? (
        <p className={styles.empty}>{emptyText}</p>
      ) : (
        <ul className={styles.list}>
          {options.map((option) => {
            const isSelected = selectedSet.has(option.id);
            return (
              <li key={option.id}>
                <button type="button" className={styles.option} aria-pressed={isSelected} onClick={() => toggle(option.id)}>
                  {option.iconUrl && <img src={option.iconUrl} alt="" width={16} height={16} />}
                  <span className={styles.label}>{option.label}</span>
                  <span className={styles.count}>{option.count}</span>
                  <span className={styles.check} aria-hidden>
                    {isSelected && <Check size={12} weight="bold" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
