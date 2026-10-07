import { useId, useMemo } from 'react';
import { overEstimateSeconds } from '../../../api/jira-issues';
import { LinkSimple } from '@phosphor-icons/react';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { Modal } from '../../../components/Modal';
import { Notice } from '../../../components/Notice';
import { StatusLozenge } from '../../../components/StatusLozenge';
import {
  type DateKey,
  formatDayMonth,
  formatTimeInTimeZone,
  formatWeekdayLong,
  toDateKeyInTimeZone,
} from '../../../lib/dates';
import { dayStatus, type IssueHours, type MetricsModel, type PersonMetrics } from '../lib/buildMetrics';
import { dayRangeText, dayScale, dayStatusNote } from '../lib/dayRanges';
import { capitalizeFirst, formatDaysAgo, formatHours, formatPercent, plural } from '../lib/format';
import { formatMonthLong } from '../lib/months';
import { similarlyNamed } from '../lib/peopleList';
import type { JiraIssue, JiraUser } from '../types';
import { IssueKeyLink } from '../../../components/IssueKeyLink';
import { MonthlyChart } from './MonthlyChart';
import { PersonAccounts } from './PersonAccounts';
import styles from './PersonDialog.module.css';

interface PersonDialogProps {
  person: PersonMetrics;
  model: MetricsModel;
  /** Dia aberto; sem ele, o último dia com horas (ou o último dia útil). */
  selectedDay?: DateKey;
  onSelectDay: (day: DateKey) => void;
  today: DateKey;
  timeZone: string;
  issueHref: (issueKey: string) => string;
  onOpenIssue: (issue: JiraIssue) => void;
  /** Outras contas do Jira já juntadas a esta pessoa. */
  linkedAccounts: JiraUser[];
  /** As demais pessoas da lista (para juntar contas da mesma pessoa). */
  otherPeople: JiraUser[];
  /** Junta a conta à desta pessoa. */
  onMergeAccount: (accountId: string) => void;
  onSplitAccount: (accountId: string) => void;
  onClose: () => void;
}

interface ProjectGroup {
  key: string;
  name: string;
  seconds: number;
  issues: IssueHours[];
  done: number;
  inProgress: number;
}

function groupByProject(issues: IssueHours[]): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>();
  for (const item of issues) {
    const { projectKey, projectName } = item.issue;
    const group = groups.get(projectKey) ?? {
      key: projectKey,
      name: projectName || projectKey,
      seconds: 0,
      issues: [],
      done: 0,
      inProgress: 0,
    };
    group.seconds += item.seconds;
    group.issues.push(item);
    if (item.issue.status.categoryKey === 'done') group.done++;
    if (item.issue.status.categoryKey === 'indeterminate') group.inProgress++;
    groups.set(projectKey, group);
  }
  return [...groups.values()].sort((a, b) => b.seconds - a.seconds);
}

function optionalHours(seconds: number | undefined): string {
  return seconds === undefined ? '—' : formatHours(seconds);
}

/** A pessoa no mês: os dias (como na lista), os apontamentos do dia escolhido, as issues por projeto e o mês a mês. */
export function PersonDialog({
  person,
  model,
  selectedDay,
  onSelectDay,
  today,
  timeZone,
  issueHref,
  onOpenIssue,
  linkedAccounts,
  otherPeople,
  onMergeAccount,
  onSplitAccount,
  onClose,
}: PersonDialogProps) {
  const titleId = useId();
  const { dayRanges, targetSeconds } = model;
  const issuesById = useMemo(() => new Map(person.issues.map(({ issue }) => [issue.id, issue])), [person.issues]);
  const projects = useMemo(() => groupByProject(person.issues), [person.issues]);

  const daysWithHours = model.days.filter((day) => (person.secondsByDay[day.date] ?? 0) > 0);
  const shownDays = model.days.filter((day) => day.isWorkday || (person.secondsByDay[day.date] ?? 0) > 0);
  const day =
    selectedDay ?? daysWithHours.filter((candidate) => candidate.date <= today).at(-1)?.date ?? model.lastWorkday ?? model.days[0].date;
  const dayInfo = model.days.find((candidate) => candidate.date === day);
  const dayWorklogs = person.worklogs.filter((worklog) => toDateKeyInTimeZone(worklog.started, timeZone) === day);
  const daySeconds = person.secondsByDay[day] ?? 0;
  const status = dayInfo && dayStatus(dayInfo, daySeconds, dayRanges);
  // Mesmo primeiro nome na lista: talvez a mesma pessoa com outra conta no Jira.
  const suggestions = similarlyNamed(person.user, otherPeople);

  return (
    <Modal
      labelledBy={titleId}
      size="large"
      onClose={onClose}
      header={
        <div className={styles.heading}>
          <Avatar src={person.user.avatarUrl} name={person.user.displayName} size={36} />
          <div className={styles.headingText}>
            <h2 id={titleId} className={styles.title}>
              {person.user.displayName}
            </h2>
            <p className={styles.meta}>
              {formatMonthLong(model.month)} · jornada de {formatHours(targetSeconds)} por dia útil
            </p>
          </div>
        </div>
      }
    >
      {suggestions.length > 0 && (
        <Notice tone="warning" className={styles.suggestion}>
          {suggestions.map((user) => user.displayName).join(' e ')} também{' '}
          {suggestions.length === 1 ? 'está' : 'estão'} na lista, com o nome parecido. Se for a mesma pessoa com outra
          conta no Jira, junte as contas para as horas contarem juntas.
          <span className={styles.suggestionActions}>
            {suggestions.map((user) => (
              <Button
                key={user.accountId}
                variant="secondary"
                icon={<LinkSimple size={14} weight="bold" />}
                onClick={() => onMergeAccount(user.accountId)}
              >
                Juntar {user.displayName}
              </Button>
            ))}
          </span>
        </Notice>
      )}

      <dl className={styles.stats}>
        <div>
          <dt>Lançado</dt>
          <dd>{formatHours(person.seconds)}</dd>
        </div>
        <div>
          <dt>Esperado</dt>
          <dd>{formatHours(person.expectedSeconds)}</dd>
        </div>
        <div>
          <dt>Cobertura</dt>
          <dd>{formatPercent(person.coverage)}</dd>
        </div>
        <div>
          <dt>Dias sem lançar</dt>
          <dd data-alert={person.missingDays.length > 0 || undefined}>{person.missingDays.length}</dd>
        </div>
        <div>
          <dt>Último lançamento</dt>
          <dd>
            {person.lastLoggedDay ? `${formatDayMonth(person.lastLoggedDay)} (${formatDaysAgo(person.lastLoggedDay, today)})` : 'Nenhum'}
          </dd>
        </div>
      </dl>

      <section className={styles.section} aria-label="Dias do mês">
        <ul className={styles.days}>
          {shownDays.map((candidate) => {
            const seconds = person.secondsByDay[candidate.date] ?? 0;
            const candidateStatus = dayStatus(candidate, seconds, dayRanges);
            return (
              <li key={candidate.date}>
                <button
                  type="button"
                  className={styles.day}
                  aria-pressed={candidate.date === day}
                  aria-label={`${formatWeekdayLong(candidate.date)}, ${formatDayMonth(candidate.date)}: ${formatHours(seconds)}, ${dayStatusNote(candidateStatus, dayRanges).toLowerCase()}`}
                  title={`${formatHours(seconds)} · ${candidate.holiday ?? dayStatusNote(candidateStatus, dayRanges)}`}
                  onClick={() => onSelectDay(candidate.date)}
                >
                  <span className={styles.dot} data-status={candidateStatus} aria-hidden />
                  {formatDayMonth(candidate.date)}
                </button>
              </li>
            );
          })}
        </ul>
        <ul className={styles.dayLegend} aria-hidden>
          {dayScale(dayRanges).map((scaleStatus) => (
            <li key={scaleStatus}>
              <span className={styles.dot} data-status={scaleStatus} /> {capitalizeFirst(dayRangeText(scaleStatus, dayRanges))}
            </li>
          ))}
          <li>
            <span className={styles.dot} data-status="missing" /> Sem lançamento
          </li>
          <li>
            <span className={styles.dot} data-status="pending" /> Ainda não terminou
          </li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby={`${titleId}-day`}>
        <header className={styles.sectionHeader}>
          <h3 id={`${titleId}-day`} className={styles.sectionTitle}>
            {formatWeekdayLong(day)}, {formatDayMonth(day)}
            {dayInfo?.holiday && <span className={styles.holiday}>{dayInfo.holiday}</span>}
          </h3>
          <span className={styles.total}>Total: {formatHours(daySeconds)}</span>
        </header>
        {dayWorklogs.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Tarefa</th>
                  <th scope="col">Descrição</th>
                  <th scope="col" className={styles.right}>
                    Horário
                  </th>
                  <th scope="col" className={styles.right}>
                    Tempo
                  </th>
                </tr>
              </thead>
              <tbody>
                {dayWorklogs.map((worklog) => {
                  const issue = issuesById.get(worklog.issueId);
                  const end = new Date(Date.parse(worklog.started) + worklog.seconds * 1000);
                  return (
                    <tr key={worklog.id}>
                      <td>{issue ? <IssueKeyLink issue={issue} href={issueHref(issue.key)} onOpen={onOpenIssue} /> : '—'}</td>
                      <td className={styles.comment}>
                        {worklog.comment || <span className={styles.muted}>{issue?.summary ?? 'Sem descrição'}</span>}
                      </td>
                      <td className={`${styles.right} ${styles.mono}`}>
                        {formatTimeInTimeZone(worklog.started, timeZone)}–{formatTimeInTimeZone(end, timeZone)}
                      </td>
                      <td className={`${styles.right} ${styles.mono}`}>{formatHours(worklog.seconds)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.empty} data-alert={status === 'missing' || undefined}>
            {status === 'missing' ? 'Dia útil sem nenhum apontamento.' : 'Nenhum apontamento neste dia.'}
          </p>
        )}
      </section>

      <MonthlyChart
        className={styles.months}
        title="Mês a mês"
        subtitle="Horas desta pessoa em cada mês da comparação, contra a jornada esperada."
        months={person.months}
        selectedMonth={model.month}
        height={130}
      />

      <section className={styles.section} aria-labelledby={`${titleId}-issues`}>
        <header className={styles.sectionHeader}>
          <h3 id={`${titleId}-issues`} className={styles.sectionTitle}>
            Issues no mês
          </h3>
          <span className={styles.total}>{plural(person.issues.length, 'issue', 'issues')}</span>
        </header>
        {projects.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Issue</th>
                  <th scope="col">Status</th>
                  <th scope="col" className={styles.right} title="Horas desta pessoa no mês">
                    No mês
                  </th>
                  <th scope="col" className={styles.right}>
                    Estimativa
                  </th>
                  <th scope="col" className={styles.right} title="Tempo lançado na issue por todos, desde o início">
                    Lançado
                  </th>
                  <th scope="col" className={styles.right}>
                    Restante
                  </th>
                </tr>
              </thead>
              {projects.map((project) => (
                <tbody key={project.key}>
                  <tr className={styles.projectRow}>
                    <th scope="colgroup" colSpan={2}>
                      {project.name} <span className={styles.projectKey}>{project.key}</span>
                      <span className={styles.projectCounts}>
                        {plural(project.issues.length, 'issue', 'issues')} · {project.inProgress} em andamento · {project.done}{' '}
                        {project.done === 1 ? 'concluída' : 'concluídas'}
                      </span>
                    </th>
                    <td className={`${styles.right} ${styles.mono}`}>{formatHours(project.seconds)}</td>
                    <td colSpan={3} />
                  </tr>
                  {project.issues.map(({ issue, seconds }) => {
                    const over = overEstimateSeconds(issue);
                    return (
                      <tr key={issue.id}>
                        <td>
                          <div className={styles.issueCell}>
                            <IssueKeyLink issue={issue} href={issueHref(issue.key)} onOpen={onOpenIssue} />
                            <span className={styles.summary}>{issue.summary}</span>
                          </div>
                        </td>
                        <td>
                          <StatusLozenge status={issue.status} />
                        </td>
                        <td className={`${styles.right} ${styles.mono} ${styles.strong}`}>{formatHours(seconds)}</td>
                        <td className={`${styles.right} ${styles.mono}`}>{optionalHours(issue.originalEstimateSeconds)}</td>
                        <td className={`${styles.right} ${styles.mono}`} data-over={over > 0 || undefined}>
                          {formatHours(issue.timeSpentSeconds)}
                          {over > 0 && <span className={styles.over}>+{formatHours(over)}</span>}
                        </td>
                        <td className={`${styles.right} ${styles.mono}`}>{optionalHours(issue.remainingEstimateSeconds)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        ) : (
          <p className={styles.empty}>Nenhuma hora lançada no mês.</p>
        )}
      </section>

      <PersonAccounts
        user={person.user}
        linkedAccounts={linkedAccounts}
        candidates={otherPeople}
        suggestions={suggestions}
        onMerge={onMergeAccount}
        onSplit={onSplitAccount}
      />
    </Modal>
  );
}
