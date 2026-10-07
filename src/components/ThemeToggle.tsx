import { Desktop, Moon, Sun } from '@phosphor-icons/react';
import { useTheme } from '../hooks/useTheme';
import { cx } from '../lib/cx';
import { type ThemePreference, useThemeStore } from '../store/useThemeStore';
import styles from './ThemeToggle.module.css';

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Escuro', Icon: Moon },
  { value: 'system', label: 'Sistema', Icon: Desktop },
];

interface ThemeToggleProps {
  /** Mostra "Sistema" (o tema do sistema operacional). Sem ela, marca o tema que vale na tela. */
  withSystem?: boolean;
  className?: string;
}

/** Escolha do tema: "Claro | Escuro" (início) ou "Claro | Escuro | Sistema" (Configurações). */
export function ThemeToggle({ withSystem = false, className }: ThemeToggleProps) {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  const theme = useTheme();
  // Sem "Sistema", a marca fica no tema que vale na tela, mesmo quando ele vem do sistema.
  const selected = withSystem ? preference : theme;
  const options = withSystem ? OPTIONS : OPTIONS.filter((option) => option.value !== 'system');

  return (
    <div className={cx(styles.toggle, className)} role="group" aria-label="Tema">
      {options.map(({ value, label, Icon }) => (
        <button key={value} type="button" aria-pressed={selected === value} onClick={() => setPreference(value)}>
          <Icon size={15} weight="bold" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
