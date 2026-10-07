import { CaretDown, CaretUp, WarningCircle } from '@phosphor-icons/react';
import { useId } from 'react';
import { Avatar } from '../../../components/Avatar';
import { TooltipPanel } from '../../../components/TooltipPanel';
import { useHoverTooltip } from '../../../hooks/useHoverTooltip';
import { type DateKey, formatDayMonth, formatWeekdayLong } from '../../../lib/dates';
import { dayStatus, type MetricsModel, type PersonMetrics } from '../lib/buildMetrics';
import { DAY_STATUS_MARKS, dayStatusNote } from '../lib/dayRanges';
import { formatDaysAgo, formatHours, formatPercent } from '../lib/format';
import { formatMonthLong, formatMonthShort } from '../lib/months';
import { BELOW_TARGET_RATIO } from '../lib/peopleList';
import type { JiraUser, PeopleSort, PeopleSortKey } from '../types';
import { ChartTooltipContent } from './ChartTooltipContent';
import styles from './PeopleTable.module.css';

type TooltipData = { kind: 'day'; person: PersonMetrics; date: DateKey } | { kind: 'months'; person: PersonMetrics };

interface PeopleTableProps {
  model: MetricsModel;
  /** Já filtradas e ordenadas. */
  people: PersonMetrics[];
  sort: PeopleSort;
  onSortChange: (sort: PeopleSort) => void;
  today: DateKey;
  /** Contas do Jira juntadas a cada pessoa (a mesma pessoa com outra conta). */
  linkedAccounts: Record<string, JiraUser[]>;
  /** Abre os detalhes da pessoa, opcionalmente num dia. */
  onOpenPerson: (person: PersonMetrics, day?: DateKey) => void;
}

const COLUMNS: { key: PeopleSortKey; label: string; initial: PeopleSort['direction'] }[] = [
  { key: 'name', label: 'Pessoa', initial: 'asc' },
  { key: 'hours', label: 'Lançado', initial: 'desc' },
  { key: 'coverage', label: 'Cobertura', initial: 'asc' },
  { key: 'missing', label: 'Sem lançar', initial: 'desc' },
  { key: 'last', label: 'Último lançamento', initial: 'asc' },
];

/** Uma linha por pessoa: horas do mês, cobertura, dias vazios, os dias do mês e o mês a mês. */
export function PeopleTable({ model, people, sort, onSortChange, today, linkedAccounts, onOpenPerson }: PeopleTableProps) {
  const tooltipId = useId();
  const { target, show, hide } = useHoverTooltip<TooltipData>({ openDelayMs: 80 });
  const { dayRanges, targetSeconds } = model;

  function toggleSort(key: PeopleSortKey, initial: PeopleSort['direction']) {
    if (sort.key === key) onSortChange({ key, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
    else onSortChange({ key, direction: initial });
  }

  function renderTooltip(data: TooltipData) {
    const { person } = data;
    if (data.kind === 'day') {
      const day = model.days.find((candidate) => candidate.date === data.date)!;
      const seconds = person.secondsByDay[data.date] ?? 0;
      const status = dayStatus(day, seconds, dayRanges);
      return (
        <ChartTooltipContent
          title={`${formatWeekdayLong(data.date)}, ${formatDayMonth(data.date)}`}
          rows={[{ label: 'lançadas', value: formatHours(seconds), mark: DAY_STATUS_MARKS[status] }]}
          note={day.holiday ?? dayStatusNote(status, dayRanges)}
        />
      );
    }
    return (
      <ChartTooltipContent
        title={person.user.displayName}
        rows={person.months.map((month) => ({
          label: formatMonthLong(month.month),
          value: month.isLoaded ? `${formatHours(month.seconds)} · ${formatPercent(month.coverage)}` : '…',
          mark: month.month === model.month ? 'bar' : 'muted-bar',
        }))}
      />
    );
  }

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={sort.key === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
              >
                <button type="button" className={styles.sort} onClick={() => toggleSort(column.key, column.initial)}>
                  {column.label}
                  {sort.key === column.key &&
                    (sort.direction === 'asc' ? <CaretUp size={11} weight="bold" /> : <CaretDown size={11} weight="bold" />)}
                </button>
              </th>
            ))}
            <th scope="col">Dias de {formatMonthLong(model.month).split(' ')[0]}</th>
            <th scope="col">Mês a mês</th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => {
            const isBelow = person.coverage !== undefined && person.coverage < BELOW_TARGET_RATIO;
            const maxMonth = Math.max(1, ...person.months.map((month) => Math.max(month.seconds, month.expectedSeconds)));
            const linked = linkedAccounts[person.user.accountId] ?? [];
            return (
              <tr key={person.user.accountId} onClick={() => onOpenPerson(person)}>
                <th scope="row">
                  <button
                    type="button"
                    className={styles.person}
                    aria-haspopup="dialog"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenPerson(person);
                    }}
                  >
                    <Avatar src={person.user.avatarUrl} name={person.user.displayName} size={24} />
                    <span className={styles.nameBlock}>
                      <span className={styles.name}>{person.user.displayName}</span>
                      {linked.length > 0 && (
                        <span className={styles.accountNote} title={`Inclui também: ${linked.map((user) => user.displayName).join(', ')}`}>
                          + {linked.length === 1 ? '1 conta juntada' : `${linked.length} contas juntadas`}
                        </span>
                      )}
                      {person.user.active === false && <span className={styles.accountNote}>conta desativada no Jira</span>}
                    </span>
                  </button>
                </th>
                <td className={styles.number}>
                  {formatHours(person.seconds)}
                  <span className={styles.sub}>de {formatHours(person.expectedSeconds)}</span>
                </td>
                <td>
                  <span className={styles.coverage}>
                    <span className={styles.number}>
                      {isBelow && <WarningCircle size={13} weight="bold" className={styles.warnIcon} aria-label="Abaixo da jornada" />}
                      {formatPercent(person.coverage)}
                    </span>
                    {person.coverage !== undefined && (
                      <span className={styles.meter} aria-hidden>
                        <span style={{ width: `${Math.min(person.coverage, 1) * 100}%` }} />
                      </span>
                    )}
                  </span>
                </td>
                <td className={styles.number}>
                  {person.missingDays.length > 0 ? (
                    <span className={styles.missing}>
                      <WarningCircle size={13} weight="bold" className={styles.missingIcon} aria-hidden />
                      {person.missingDays.length} {person.missingDays.length === 1 ? 'dia' : 'dias'}
                      <span className={styles.sub}>{person.missingDays.map((date) => date.slice(8)).join(', ')}</span>
                    </span>
                  ) : (
                    <span className={styles.none}>—</span>
                  )}
                </td>
                <td className={styles.number}>
                  {person.lastLoggedDay ? (
                    <>
                      {formatDayMonth(person.lastLoggedDay)}
                      <span className={styles.sub}>{formatDaysAgo(person.lastLoggedDay, today)}</span>
                    </>
                  ) : (
                    <span className={styles.none}>Nenhum</span>
                  )}
                </td>
                <td>
                  <span
                    className={styles.strip}
                    style={{ gridTemplateColumns: `repeat(${model.days.length}, 7px)` }}
                    aria-label={`${person.missingDays.length} dias úteis sem lançamento no mês`}
                    role="img"
                  >
                    {model.days.map((day) => {
                      const seconds = person.secondsByDay[day.date] ?? 0;
                      const isActive = target?.data.kind === 'day' && target.data.person === person && target.data.date === day.date;
                      return (
                        <span
                          key={day.date}
                          className={styles.cell}
                          data-status={dayStatus(day, seconds, dayRanges)}
                          data-today={day.isToday || undefined}
                          data-active={isActive || undefined}
                          onPointerEnter={(event) => show(event.currentTarget, { kind: 'day', person, date: day.date })}
                          onPointerLeave={hide}
                          onClick={(event) => {
                            event.stopPropagation();
                            hide();
                            onOpenPerson(person, day.date);
                          }}
                        >
                          {seconds > 0 && <span className={styles.fill} style={{ height: `${Math.min(seconds / targetSeconds, 1) * 100}%` }} />}
                        </span>
                      );
                    })}
                  </span>
                </td>
                <td>
                  <span
                    className={styles.spark}
                    role="img"
                    aria-label={person.months
                      .map((month) => `${formatMonthShort(month.month)} ${month.isLoaded ? formatPercent(month.coverage) : 'carregando'}`)
                      .join(', ')}
                    onPointerEnter={(event) => show(event.currentTarget, { kind: 'months', person })}
                    onPointerLeave={hide}
                  >
                    {person.months.map((month) => (
                      <span
                        key={month.month}
                        className={styles.sparkBar}
                        data-tone={month.month === model.month ? 'accent' : 'muted'}
                        data-pending={!month.isLoaded || undefined}
                        style={{ height: month.isLoaded ? `${Math.max(4, (month.seconds / maxMonth) * 100)}%` : '20%' }}
                      />
                    ))}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {target && (
        <TooltipPanel anchor={target.anchor} id={tooltipId} className={styles.tooltip}>
          {renderTooltip(target.data)}
        </TooltipPanel>
      )}
    </div>
  );
}
