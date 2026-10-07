import { useId } from 'react';
import { ThemeToggle } from '../../../components/ThemeToggle';
import { useTheme } from '../../../hooks/useTheme';
import { useThemeStore } from '../../../store/useThemeStore';
import styles from './Section.module.css';

/** "Aparência": tema claro, escuro ou o do sistema operacional, neste navegador. */
export function ThemeSection() {
  const headingId = useId();
  const preference = useThemeStore((state) => state.preference);
  const theme = useTheme();

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.head}>
        <h2 id={headingId} className={styles.heading}>
          Aparência
        </h2>
        <p className={styles.description}>
          O tema de todas as telas, salvo neste navegador. Em “Sistema”, o app acompanha o tema do seu computador. A tela de
          início também tem a troca entre claro e escuro.
        </p>
      </div>
      <div className={styles.card}>
        <ThemeToggle withSystem />
        {preference === 'system' && (
          <p className={styles.cardText}>Agora: {theme === 'dark' ? 'escuro' : 'claro'}, como no sistema.</p>
        )}
      </div>
    </section>
  );
}
