import { SquaresFour } from '@phosphor-icons/react';
import { Notice } from '../../../components/Notice';
import styles from './SharedDashboardSummary.module.css';

interface SharedDashboardSummaryProps {
  name: string;
  blocks: number;
  /** Peças de dados: cada uma é uma busca no Jira, com a conta de quem aceitar. */
  sources: number;
  /** O período do dashboard ("Este mês"). */
  period: string;
  /** Peças ou ligações do arquivo que a validação deixou de fora. */
  skipped: number;
}

const integer = new Intl.NumberFormat('pt-BR');

function count(value: number, singular: string, plural: string): string {
  return `${integer.format(value)} ${value === 1 ? singular : plural}`;
}

/** O dashboard que chegou (por uma conexão ou por um link), antes de aceitar. */
export function SharedDashboardSummary({ name, blocks, sources, period, skipped }: SharedDashboardSummaryProps) {
  return (
    <div className={styles.summary}>
      <div className={styles.card}>
        <span className={styles.icon} aria-hidden>
          <SquaresFour size={18} weight="bold" />
        </span>
        <span className={styles.text}>
          <span className={styles.name}>{name}</span>
          <span className={styles.meta}>
            {count(blocks, 'bloco', 'blocos')} · {count(sources, 'busca no Jira', 'buscas no Jira')}
            {period && ` · ${period}`}
          </span>
        </span>
      </div>
      {skipped > 0 && (
        <Notice tone="warning">
          {count(skipped, 'peça ou ligação inválida vai ficar', 'peças ou ligações inválidas vão ficar')} de fora.
        </Notice>
      )}
      <p className={styles.note}>
        Vem a montagem: peças, ligações, período e as escolhas de cada peça (squads, pessoas, JQL). Os números, não: aceitando, ele
        entra em “Meus dashboards” e as buscas rodam na sua conta, com as suas permissões.
      </p>
    </div>
  );
}
