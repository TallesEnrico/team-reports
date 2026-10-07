import { useId } from 'react';
import { FormField } from './FormField';

export interface SelectOption<Value extends string> {
  value: Value;
  label: string;
}

interface LabeledSelectProps<Value extends string> {
  label: string;
  value: Value;
  options: SelectOption<Value>[];
  onChange: (value: Value) => void;
  layout?: 'stacked' | 'inline';
}

export function LabeledSelect<Value extends string>({ label, value, options, onChange, layout }: LabeledSelectProps<Value>) {
  const id = useId();
  return (
    <FormField label={label} htmlFor={id} layout={layout}>
      <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value as Value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}
