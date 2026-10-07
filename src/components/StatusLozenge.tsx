import type { IssueStatus } from '../api/jira-issues';
import styles from './StatusLozenge.module.css';

/** Status da issue na cor da categoria (a fazer, em andamento, concluído). */
export function StatusLozenge({ status }: { status: IssueStatus }) {
  return (
    <span className={styles.lozenge} data-category={status.categoryKey ?? 'new'}>
      {status.name}
    </span>
  );
}
