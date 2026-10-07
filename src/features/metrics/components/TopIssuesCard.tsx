import type { MetricsModel } from '../lib/buildMetrics';
import { formatTotalHours, plural } from '../lib/format';
import type { JiraIssue } from '../types';
import { BarList, type BarListItem } from './BarList';
import { ChartCard } from './ChartCard';
import { IssueKeyLink } from '../../../components/IssueKeyLink';
import styles from './TopIssuesCard.module.css';

interface TopIssuesCardProps {
  model: MetricsModel;
  issueHref: (issueKey: string) => string;
  onOpenIssue: (issue: JiraIssue) => void;
}

/** As issues que mais receberam horas da equipe no mês. */
export function TopIssuesCard({ model, issueHref, onOpenIssue }: TopIssuesCardProps) {
  const items: BarListItem[] = model.topIssues.map(({ issue, seconds, people }) => ({
    id: issue.id,
    label: (
      <>
        <IssueKeyLink issue={issue} href={issueHref(issue.key)} onOpen={onOpenIssue} />
        <span className={styles.summary}>{issue.summary}</span>
      </>
    ),
    value: seconds,
    valueLabel: formatTotalHours(seconds),
    detail: plural(people, 'pessoa', 'pessoas'),
  }));

  return (
    <ChartCard
      title="Issues com mais horas"
      subtitle={`${plural(model.team.issuesWorked, 'issue recebeu', 'issues receberam')} horas no mês; as ${Math.min(items.length, 10)} maiores.`}
    >
      {items.length > 0 ? <BarList items={items} label="Issues com mais horas" /> : <p className={styles.empty}>Nenhuma hora no mês.</p>}
    </ChartCard>
  );
}
