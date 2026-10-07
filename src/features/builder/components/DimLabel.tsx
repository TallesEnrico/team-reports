import { IssueKeyLink } from '../../../components/IssueKeyLink';
import type { DimValue } from '../types';
import { useBuilderContext } from './BuilderContext';
import styles from './DimLabel.module.css';

interface DimLabelProps {
  value: DimValue;
  /** Só o texto (na prévia das peças, onde um link atrapalharia o arrasto). */
  plain?: boolean;
}

/** Rótulo de um grupo; issue (e issue pai) mostra a chave, que abre o modal dela. */
export function DimLabel({ value, plain = false }: DimLabelProps) {
  const { openIssue, issueHref } = useBuilderContext();
  if (!value.issue || plain) {
    return (
      <span className={styles.text} title={value.label}>
        {value.label}
      </span>
    );
  }
  return (
    <span className={styles.issue} title={value.label}>
      <IssueKeyLink issue={value.issue} href={issueHref(value.issue.key)} onOpen={openIssue} />
      <span className={styles.summary}>{value.issue.summary}</span>
    </span>
  );
}
