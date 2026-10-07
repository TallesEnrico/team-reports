import type { ReactNode } from 'react';
import styles from './PageMessage.module.css';

interface PageMessageProps {
  tone: 'neutral' | 'loading' | 'error';
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}

/** Aviso centralizado na área de conteúdo: vazio, carregando ou erro. */
export function PageMessage({ tone, icon, title, children }: PageMessageProps) {
  return (
    <div className={`${styles.message} ${styles[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className={styles.icon}>{icon}</span>
      <p className={styles.title}>{title}</p>
      {children && <div className={styles.body}>{children}</div>}
    </div>
  );
}
