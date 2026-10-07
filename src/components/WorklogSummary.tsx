import { formatDateBR, formatTimeInTimeZone, formatWeekdayLong, toDateKeyInTimeZone } from '../lib/dates';
import { formatDuration, type TimeFormat } from '../lib/formatDuration';
import { worklogEndInstant } from '../lib/worklogForm';
import styles from './WorklogSummary.module.css';

interface WorklogSummaryProps {
  worklog: { started: string; seconds: number; comment: string };
  timeZone: string;
  timeFormat: TimeFormat;
}

/** Data, início–fim, duração e descrição de um apontamento. */
export function WorklogSummary({ worklog, timeZone, timeFormat }: WorklogSummaryProps) {
  const day = toDateKeyInTimeZone(worklog.started, timeZone);
  const end = worklogEndInstant(worklog);
  const crossesDay = toDateKeyInTimeZone(end, timeZone) !== day;

  return (
    <>
      <p className={styles.when}>
        <span>
          {formatDateBR(day)} ({formatWeekdayLong(day)})
        </span>
        <span>
          {formatTimeInTimeZone(worklog.started, timeZone)} – {formatTimeInTimeZone(end, timeZone)}
          {crossesDay && ' (+1 dia)'}
        </span>
        <span className={styles.duration}>{formatDuration(worklog.seconds, timeFormat)}</span>
      </p>
      {worklog.comment ? (
        <p className={styles.comment}>{worklog.comment}</p>
      ) : (
        <p className={styles.empty}>Sem descrição</p>
      )}
    </>
  );
}
