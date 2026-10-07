import { formatDuration, type TimeFormat } from '../../../lib/formatDuration';
import styles from './ReportSummary.module.css';

interface ReportSummaryProps {
  totalSeconds: number;
  issueCount: number;
  authorCount: number;
  timeFormat: TimeFormat;
}

export function ReportSummary({ totalSeconds, issueCount, authorCount, timeFormat }: ReportSummaryProps) {
  const items = [
    { label: 'Tempo apontado', value: formatDuration(totalSeconds, timeFormat) || '0' },
    { label: issueCount === 1 ? 'Issue' : 'Issues', value: String(issueCount) },
    { label: authorCount === 1 ? 'Pessoa' : 'Pessoas', value: String(authorCount) },
  ];

  return (
    <dl className={styles.summary}>
      {items.map((item) => (
        <div key={item.label} className={styles.item}>
          <dt className={styles.label}>{item.label}</dt>
          <dd className={styles.value}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
