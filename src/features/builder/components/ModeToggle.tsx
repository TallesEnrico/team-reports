import { PuzzlePiece, SquaresFour } from '@phosphor-icons/react';
import type { BuilderMode } from '../types';
import styles from './ModeToggle.module.css';

const MODES: { value: BuilderMode; label: string; Icon: typeof PuzzlePiece }[] = [
  { value: 'build', label: 'Montar', Icon: PuzzlePiece },
  { value: 'view', label: 'Dashboard', Icon: SquaresFour },
];

/** Montagem (o quadro de peças) ou o dashboard montado. */
export function ModeToggle({ value, onChange }: { value: BuilderMode; onChange: (mode: BuilderMode) => void }) {
  return (
    <div className={styles.toggle} role="group" aria-label="Visualização">
      {MODES.map(({ value: mode, label, Icon }) => (
        <button key={mode} type="button" aria-pressed={value === mode} onClick={() => onChange(mode)}>
          <Icon size={14} weight="bold" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
