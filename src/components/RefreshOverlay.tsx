import { CircleNotch } from '@phosphor-icons/react';
import styles from './RefreshOverlay.module.css';

/**
 * Aviso "Atualizando…" sobre um conteúdo que continua na tela enquanto os
 * dados são buscados de novo. O pai precisa de `position: relative` e esmaece
 * o próprio conteúdo (ex: `opacity: 0.4`).
 */
export function RefreshOverlay() {
  return (
    <div className={styles.overlay} role="status">
      <span className={styles.pill}>
        <CircleNotch size={16} weight="bold" className={styles.spinner} aria-hidden />
        Atualizando…
      </span>
    </div>
  );
}
