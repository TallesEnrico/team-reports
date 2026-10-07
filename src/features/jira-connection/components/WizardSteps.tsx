import { Check } from '@phosphor-icons/react';
import { cx } from '../../../lib/cx';
import styles from './WizardSteps.module.css';

interface WizardStepsProps {
  steps: readonly string[];
  /** Índice do passo atual (0-based). */
  current: number;
}

export function WizardSteps({ steps, current }: WizardStepsProps) {
  return (
    <ol className={styles.steps}>
      {steps.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'upcoming';
        return (
          <li key={label} className={cx(styles.step, styles[state])} aria-current={index === current ? 'step' : undefined}>
            <span className={styles.marker}>
              {state === 'done' ? <Check size={12} weight="bold" aria-label="concluído" /> : index + 1}
            </span>
            <span className={styles.label}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
