import { type ReactNode, type PointerEvent as ReactPointerEvent, useId, useRef, useState } from 'react';
import type { JiraIssue } from '../../../api/jira-issues';
import { formatDayMonth, formatWeekdayLong, todayKey } from '../../../lib/dates';
import { formatDuration } from '../../../lib/formatDuration';
import { isPlainClick } from '../../../lib/isPlainClick';
import type { ShortDay } from '../api/home-metrics-api';
import { useHomeIssuesQuery, useShortDaysQuery } from '../api/useHomeMetricsQuery';
import styles from './HomeMetrics.module.css';
import { Link } from 'react-router';

interface HomeMetricsProps {
  accountId: string;
  timeZone: string;
  onOpenIssue: (issue: JiraIssue) => void;
  hrefFor: (issueKey: string) => string;
}

export function HomeMetrics({ accountId, timeZone, onOpenIssue, hrefFor }: HomeMetricsProps) {
  const today = todayKey(timeZone);
  const shortDays = useShortDaysQuery(accountId, timeZone);
  const inProgress = useHomeIssuesQuery(accountId, 'in-progress', timeZone);
  const completed = useHomeIssuesQuery(accountId, 'completed', timeZone);
  const inProgressIssues = visibleIssues(inProgress.data?.issues, 'indeterminate');
  const completedIssues = visibleIssues(completed.data?.issues, 'done');
  const [openMetric, setOpenMetric] = useState<'days' | 'progress' | 'done' | null>(null);
  function show(metric: 'days' | 'progress' | 'done') {
    setOpenMetric(metric);
  }
  function hide(metric: 'days' | 'progress' | 'done') {
    setOpenMetric((current) => (current === metric ? null : current));
  }

  return (
    <div className={styles.metrics} aria-label="Seu mês no Jira">
      <CountMetric
        open={openMetric === 'days'}
        onOpen={() => show('days')}
        onClose={() => hide('days')}
        count={shortDays.data?.length}
        pending={shortDays.isPending}
        failed={shortDays.isError}
        singular="dia abaixo de 3h"
        plural="dias abaixo de 3h"
        danger={(shortDays.data?.length ?? 0) > 0}
      >
        <DayList days={shortDays.data} today={today} pending={shortDays.isPending} failed={shortDays.isError} />
      </CountMetric>
      <CountMetric
        open={openMetric === 'progress'}
        onOpen={() => show('progress')}
        onClose={() => hide('progress')}
        count={inProgress.isSuccess ? inProgressIssues.length : undefined}
        pending={inProgress.isPending}
        failed={inProgress.isError}
        singular="em andamento"
        plural="em andamento"
        danger={inProgressIssues.length > 1}
      >
        <IssueList
          issues={inProgressIssues}
          pending={inProgress.isPending}
          failed={inProgress.isError}
          empty="Nenhuma tarefa em andamento."
          truncated={inProgress.data?.isTruncated}
          onOpenIssue={onOpenIssue}
          hrefFor={hrefFor}
        />
      </CountMetric>
      <CountMetric
        open={openMetric === 'done'}
        onOpen={() => show('done')}
        onClose={() => hide('done')}
        count={completed.isSuccess ? completedIssues.length : undefined}
        pending={completed.isPending}
        failed={completed.isError}
        singular="concluída no mês"
        plural="concluídas no mês"
      >
        <IssueList
          issues={completedIssues}
          pending={completed.isPending}
          failed={completed.isError}
          empty="Nenhuma tarefa concluída neste mês."
          truncated={completed.data?.isTruncated}
          onOpenIssue={onOpenIssue}
          hrefFor={hrefFor}
        />
      </CountMetric>
    </div>
  );
}

function visibleIssues(issues: JiraIssue[] | undefined, category: string): JiraIssue[] {
  return (issues ?? []).filter((issue) => !issue.status.categoryKey || issue.status.categoryKey === category);
}

function CountMetric({
  open,
  onOpen,
  onClose,
  count,
  pending,
  failed,
  singular,
  plural,
  danger = false,
  children,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  count: number | undefined;
  pending: boolean;
  failed: boolean;
  singular: string;
  plural: string;
  danger?: boolean;
  children: ReactNode;
}) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const pointerKind = useRef<string>('mouse');
  const label = count === 1 ? singular : plural;
  const value = failed ? '–' : pending || count === undefined ? '…' : String(count);

  function onPointerDown(event: ReactPointerEvent) {
    pointerKind.current = event.pointerType;
  }

  function onPointerEnter(event: ReactPointerEvent) {
    pointerKind.current = event.pointerType;
    if (event.pointerType === 'mouse') onOpen();
  }

  function onPointerLeave(event: ReactPointerEvent) {
    if (event.pointerType !== 'mouse') return;
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    if (rootRef.current?.contains(document.activeElement)) return;
    onClose();
  }

  return (
    <div
      ref={rootRef}
      className={styles.metric}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={() => {
        if (pointerKind.current === 'touch') return;
        onOpen();
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={panelId}
        aria-busy={pending || undefined}
        onClick={() => {
          if (pointerKind.current === 'mouse' && window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
          if (open) onClose();
          else onOpen();
        }}
      >
        <span className={styles.value} data-tone={!failed && !pending && danger ? 'danger' : undefined}>
          {value}
        </span>
        <span className={styles.label}>{label}</span>
      </button>
      <div id={panelId} className={styles.panel} hidden={!open}>
        <div className={styles.panelBody}>{children}</div>
      </div>
    </div>
  );
}

function DayList({
  days,
  today,
  pending,
  failed,
}: {
  days: ShortDay[] | undefined;
  today: string;
  pending: boolean;
  failed: boolean;
}) {
  if (pending) return <p className={styles.empty}>Buscando no Jira…</p>;
  if (failed) return <p className={styles.empty}>Não foi possível buscar no Jira.</p>;
  if (!days || days.length === 0) {
    return <p className={styles.empty}>Nenhum dia útil deste mês ficou sem horas ou abaixo de 3h.</p>;
  }
  return (
    <ul className={styles.list}>
      {days.map((day) => {
        const when = day.date === today ? `Hoje, ${formatDayMonth(day.date)}` : `${formatWeekdayLong(day.date)}, ${formatDayMonth(day.date)}`;
        const hours = day.seconds ? formatDuration(day.seconds, 'hours-minutes') : 'sem horas';
        return (
          <Link to={`/reports?date=${day.date}`}>
            <li key={day.date} className={styles.day} aria-label={`${when}, ${hours}`}>
              <span className="font-medium">{when}</span>
              <span className={day.seconds ? styles.hours : styles.missing}>{hours}</span>
            </li>
          </Link>
        );
      })}
    </ul>
  );
}

function IssueList({
  issues,
  pending,
  failed,
  empty,
  truncated,
  onOpenIssue,
}: {
  issues: JiraIssue[];
  pending: boolean;
  failed: boolean;
  empty: string;
  truncated?: boolean;
  onOpenIssue: (issue: JiraIssue) => void;
  hrefFor: (issueKey: string) => string;
}) {
  if (pending) return <p className={styles.empty}>Buscando no Jira…</p>;
  if (failed) return <p className={styles.empty}>Não foi possível buscar no Jira.</p>;
  if (issues.length === 0) return <p className={styles.empty}>{empty}</p>;
  return (
    <>
      <ul className={styles.list}>
        {issues.map((issue) => (
          <li key={issue.id} className={styles.issue}>
            <span className={styles.issueKey}>{issue.key}</span>
            <p
              className={styles.sumaryOpen}
              aria-label={`Abrir ${issue.key}`}
              onClick={(event) => {
                if (!isPlainClick(event)) return;
                event.preventDefault();
                onOpenIssue(issue);
              }}
            >
              <span className={styles.summary}>{issue.summary}</span>
            </p>
          </li>
        ))}
      </ul>
      {truncated && <p className={styles.more}>Há mais no Jira do que esta lista mostra.</p>}
    </>
  );
}
