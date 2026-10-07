import { useId, useMemo } from 'react';
import type { DateKey } from '../../../lib/dates';
import type { MetricsModel, PersonMetrics } from '../lib/buildMetrics';
import { DAY_STATUS_MARKS, dayRangeText, dayScale } from '../lib/dayRanges';
import { capitalizeFirst, formatHours } from '../lib/format';
import { matchesPersonFilter, personFilterOptions, sortPeople } from '../lib/peopleList';
import type { JiraUser, PeopleSort, PersonFilter } from '../types';
import { ChartLegend } from './ChartCard';
import styles from './PeopleSection.module.css';
import { PeopleTable } from './PeopleTable';

interface PeopleSectionProps {
  model: MetricsModel;
  filter: PersonFilter;
  onFilterChange: (filter: PersonFilter) => void;
  sort: PeopleSort;
  onSortChange: (sort: PeopleSort) => void;
  today: DateKey;
  linkedAccounts: Record<string, JiraUser[]>;
  onOpenPerson: (person: PersonMetrics, day?: DateKey) => void;
}

/** A equipe pessoa a pessoa, com os recortes (quem está sem lançar, abaixo da jornada…). */
export function PeopleSection({
  model,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  today,
  linkedAccounts,
  onOpenPerson,
}: PeopleSectionProps) {
  const titleId = useId();
  const options = useMemo(() => personFilterOptions(model), [model]);
  // Recorte que não existe mais (ex: mês sem dia útil decorrido) volta a "Todas".
  const activeFilter = options.some((option) => option.id === filter) ? filter : 'all';
  const people = useMemo(
    () => sortPeople(model.people.filter((person) => matchesPersonFilter(person, activeFilter)), sort),
    [model.people, activeFilter, sort],
  );

  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <header className={styles.header}>
        <div className={styles.titles}>
          <h2 id={titleId} className={styles.title}>
            Pessoas
          </h2>
          <p className={styles.subtitle}>
            Jornada de {formatHours(model.targetSeconds)} por dia útil; nos dias, a altura é a fração da jornada e a cor,
            a faixa das horas. Clique numa pessoa (ou num dia) para ver os apontamentos e as issues.
          </p>
        </div>
        <ChartLegend
          entries={[
            ...dayScale(model.dayRanges).map((status) => ({
              label: capitalizeFirst(dayRangeText(status, model.dayRanges)),
              swatch: DAY_STATUS_MARKS[status],
            })),
            { label: 'Sem lançamento', swatch: DAY_STATUS_MARKS.missing },
          ]}
        />
      </header>

      <div className={styles.filters} role="group" aria-label="Recorte da lista de pessoas">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={styles.chip}
            aria-pressed={activeFilter === option.id}
            disabled={option.count === 0 && option.id !== 'all'}
            onClick={() => onFilterChange(option.id)}
          >
            {option.label}
            <span className={styles.count}>{option.count}</span>
          </button>
        ))}
      </div>

      {people.length > 0 ? (
        <PeopleTable
          model={model}
          people={people}
          sort={sort}
          onSortChange={onSortChange}
          today={today}
          linkedAccounts={linkedAccounts}
          onOpenPerson={onOpenPerson}
        />
      ) : (
        <p className={styles.empty}>Ninguém neste recorte.</p>
      )}
    </section>
  );
}
