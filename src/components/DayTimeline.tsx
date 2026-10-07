import { CircleNotch, WarningCircle } from '@phosphor-icons/react';
import type { DayWorklog } from '../api/jira-day-worklogs';
import { useMyDayWorklogsQuery } from '../api/useMyDayWorklogsQuery';
import { type DateKey, formatDayMonth, formatWeekdayShort, isDateKey } from '../lib/dates';
import { formatDuration } from '../lib/formatDuration';
import styles from './DayTimeline.module.css';

interface DayTimelineProps {
  /** Data e horários (HH:mm) do formulário, ainda em edição. */
  date: DateKey;
  start: string;
  end: string;
  timeZone: string;
}

/** Faixa mostrada sem nada fora dela (horário comercial com folga); cresce para caber os apontamentos. */
const DEFAULT_FROM = 8 * 60;
const DEFAULT_TO = 19 * 60;
/** Conflitos citados pelo nome; os demais viram "e mais N". */
const NAMED_CONFLICTS = 2;

function minutesOf(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function clock(minutes: number): string {
  const rounded = Math.round(minutes);
  return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}

function hours(minutes: number): string {
  return formatDuration(Math.round(minutes) * 60, 'hours-minutes') || '0h 00m';
}

function range(worklog: DayWorklog): string {
  return `${clock(worklog.startMinute)}–${clock(worklog.endMinute)}`;
}

/**
 * Linha do tempo do dia escolhido no "Lançar horas": os seus apontamentos do
 * dia (em qualquer issue), o total já lançado e, conforme os horários são
 * preenchidos, o lançamento novo na mesma barra, em vermelho quando cruza um
 * horário que já tem apontamento.
 */
export function DayTimeline({ date, start, end, timeZone }: DayTimelineProps) {
  const query = useMyDayWorklogsQuery(date, timeZone);
  const worklogs = query.data ?? [];
  const startMinute = minutesOf(start);
  const endMinute = minutesOf(end);
  const draft = startMinute !== null && endMinute !== null && endMinute > startMinute ? { start: startMinute, end: endMinute } : null;
  const conflicts = draft ? worklogs.filter((worklog) => draft.start < worklog.endMinute && worklog.startMinute < draft.end) : [];
  const conflictIds = new Set(conflicts.map((worklog) => worklog.id));
  const loggedMinutes = worklogs.reduce((sum, worklog) => sum + worklog.endMinute - worklog.startMinute, 0);

  // A faixa cresce, de hora em hora, para caber os apontamentos e o lançamento novo.
  const points = [
    DEFAULT_FROM,
    DEFAULT_TO,
    ...worklogs.flatMap((worklog) => [worklog.startMinute, worklog.endMinute]),
    ...(draft ? [draft.start, draft.end] : startMinute !== null ? [startMinute] : []),
  ];
  const from = Math.max(0, Math.floor(Math.min(...points) / 60) * 60);
  const to = Math.min(24 * 60, Math.ceil(Math.max(...points) / 60) * 60);
  const span = to - from;
  const percent = (minute: number) => ((minute - from) / span) * 100;
  const hourMarks = Array.from({ length: span / 60 + 1 }, (_, index) => from + index * 60);
  const labelEvery = span > 12 * 60 ? 2 : 1;

  if (!isDateKey(date)) return null;

  return (
    <section className={styles.timeline} aria-label={`Seus lançamentos em ${formatDayMonth(date)}`}>
      <header className={styles.header}>
        <span className={styles.title}>
          Seu dia · {formatWeekdayShort(date)}, {formatDayMonth(date)}
        </span>
        <span className={styles.total}>
          {query.isPending ? (
            <>
              <CircleNotch size={12} weight="bold" className={styles.spinner} aria-hidden /> Carregando…
            </>
          ) : (
            <>
              <strong>{hours(loggedMinutes)}</strong> lançadas
              {draft && (
                <span className={styles.withDraft}>
                  {' '}
                  · {hours(loggedMinutes + draft.end - draft.start)} com este
                </span>
              )}
            </>
          )}
        </span>
      </header>

      <div className={styles.track} aria-hidden>
        {hourMarks.map((minute) => (
          <span key={minute} className={styles.hourLine} style={{ left: `${percent(minute)}%` }} />
        ))}
        {worklogs.map((worklog) => (
          <span
            key={worklog.id}
            className={styles.block}
            data-conflict={conflictIds.has(worklog.id) || undefined}
            style={{ left: `${percent(worklog.startMinute)}%`, width: `${percent(worklog.endMinute) - percent(worklog.startMinute)}%` }}
            title={`${worklog.issueKey} · ${range(worklog)} (${hours(worklog.endMinute - worklog.startMinute)})\n${worklog.issueSummary}`}
          >
            <span className={styles.blockLabel}>{worklog.issueKey}</span>
          </span>
        ))}
        {draft ? (
          <span
            className={styles.draft}
            data-conflict={conflicts.length > 0 || undefined}
            style={{ left: `${percent(draft.start)}%`, width: `${percent(draft.end) - percent(draft.start)}%` }}
            title={`Este lançamento · ${clock(draft.start)}–${clock(draft.end)}`}
          />
        ) : (
          startMinute !== null && <span className={styles.marker} style={{ left: `${percent(startMinute)}%` }} />
        )}
        {!query.isPending && worklogs.length === 0 && !draft && (
          <span className={styles.empty}>Nenhum lançamento seu neste dia</span>
        )}
      </div>

      <div className={styles.axis} aria-hidden>
        {hourMarks.map((minute, index) =>
          index % labelEvery === 0 ? (
            <span key={minute} style={{ left: `${percent(minute)}%` }}>
              {String(minute / 60).padStart(2, '0')}h
            </span>
          ) : null,
        )}
      </div>

      {query.isError ? (
        <p className={styles.message} data-tone="muted">
          Não foi possível carregar seus lançamentos do dia: {query.error.message}
        </p>
      ) : conflicts.length > 0 && (
        <p className={styles.message} data-tone="conflict" role="status">
          <WarningCircle size={14} weight="bold" aria-hidden />
          <span>
            Este horário coincide com{' '}
            {conflicts
              .slice(0, NAMED_CONFLICTS)
              .map((worklog) => `${worklog.issueKey} (${range(worklog)})`)
              .join(' e ')}
            {conflicts.length > NAMED_CONFLICTS && ` e mais ${conflicts.length - NAMED_CONFLICTS}`}.
          </span>
        </p>
      )}

      {/* A barra é só visual: a lista é o que leitores de tela leem. */}
      {worklogs.length > 0 && (
        <ul className="sr-only">
          {worklogs.map((worklog) => (
            <li key={worklog.id}>
              {range(worklog)}, {worklog.issueKey}: {worklog.issueSummary}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
