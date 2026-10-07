import { CheckCircle, LockSimple, WarningCircle } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import styles from './Notice.module.css';

interface NoticeProps {
  tone: 'success' | 'warning' | 'error';
  children: ReactNode;
  className?: string;
}

const ICONS = { success: CheckCircle, warning: WarningCircle, error: WarningCircle };

/** Aviso curto dentro de um bloco (salvo, erro, atenção). */
export function Notice({ tone, children, className }: NoticeProps) {
  const Icon = ICONS[tone];
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={cx(styles.notice, styles[tone], className)}>
      <Icon size={16} weight="bold" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

interface ReadOnlyNoticeProps {
  /** O que fica indisponível, no infinitivo (ex: "editar apontamentos"). */
  action: string;
  className?: string;
}

/** Token sem `write:jira-work`: explica por que a escrita está desligada e como liberar. */
export function ReadOnlyNotice({ action, className }: ReadOnlyNoticeProps) {
  return (
    <p role="note" className={cx(styles.notice, styles.warning, styles.small, className)}>
      <LockSimple size={14} weight="bold" aria-hidden />
      <span>
        Somente leitura: o token conectado não tem o escopo <code>write:jira-work</code>. Para {action}, crie um token com
        esse escopo, clique em "Sair" e conecte com ele.
      </span>
    </p>
  );
}
