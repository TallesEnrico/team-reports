import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import styles from './FormField.module.css';

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  /** `stacked`: rótulo acima (formulários); `inline`: rótulo ao lado e controle compacto (barras de ferramentas). */
  layout?: 'stacked' | 'inline';
  children: ReactNode;
}

export function FormField({ label, htmlFor, hint, layout = 'stacked', children }: FormFieldProps) {
  return (
    <div className={cx(styles.field, layout === 'inline' && styles.inline)}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <div className={styles.hint}>{hint}</div>}
    </div>
  );
}
