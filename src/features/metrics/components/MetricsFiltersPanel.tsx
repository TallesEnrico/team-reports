import { useId } from 'react';
import type { JiraProject } from '../../../api/jira-projects';
import { FormField } from '../../../components/FormField';
import { LabeledSelect, type SelectOption } from '../../../components/LabeledSelect';
import { SquadMultiSelect } from '../../../components/SquadMultiSelect';
import { plural } from '../lib/format';
import { useMetricsStore } from '../store/useMetricsStore';
import type { CompareMonths, HoursScope, JiraUser, MonthKey } from '../types';
import { DayRangesField } from './DayRangesField';
import styles from './MetricsFiltersPanel.module.css';
import { MonthField } from './MonthField';
import { PeoplePicker } from './PeoplePicker';

const COMPARE_OPTIONS: SelectOption<`${CompareMonths}`>[] = [
  { value: '1', label: 'Último mês' },
  { value: '3', label: 'Últimos 3 meses' },
  { value: '6', label: 'Últimos 6 meses' },
  { value: '12', label: 'Últimos 12 meses' },
];

const SCOPE_OPTIONS: SelectOption<HoursScope>[] = [
  { value: 'all', label: 'Em qualquer projeto' },
  { value: 'squad', label: 'Só nas issues da squad' },
];

interface MetricsFiltersPanelProps {
  month: MonthKey;
  currentMonth: MonthKey;
  /** Mês aberto sem escolha (o do último dia útil que passou). */
  defaultMonth: MonthKey;
  projectKeys: string[] | undefined;
  hasSquads: boolean;
  connectedSquad: string | undefined;
  projects: JiraProject[];
  isLoadingProjects: boolean;
  projectsFailed: boolean;
  /** Quem lançou horas nas squads nos meses comparados. */
  contributors: JiraUser[];
  /** Quem pode ser responsável em alguma das squads. */
  members: JiraUser[];
  membersFailed: boolean;
  /** Todas as pessoas do Jira. */
  allUsers: JiraUser[];
  isLoadingUsers: boolean;
  usersFailed: boolean;
  /** "Todas as pessoas" escolhida em "Pessoas". */
  isAllPeople: boolean;
  /** As pessoas escolhidas, com nome e foto. */
  selectedPeople: JiraUser[];
  /** O recorte das horas valendo (sem squad, sempre em qualquer projeto). */
  scope: HoursScope;
}

/** Filtros do Metrics na lateral; valem na hora, sem botão de aplicar. */
export function MetricsFiltersPanel({
  month,
  currentMonth,
  defaultMonth,
  projectKeys,
  hasSquads,
  connectedSquad,
  projects,
  isLoadingProjects,
  projectsFailed,
  contributors,
  members,
  membersFailed,
  allUsers,
  isLoadingUsers,
  usersFailed,
  isAllPeople,
  selectedPeople,
  scope,
}: MetricsFiltersPanelProps) {
  const monthId = useId();
  const squadId = useId();
  const peopleId = useId();
  const compareMonths = useMetricsStore((state) => state.compareMonths);
  const dayRanges = useMetricsStore((state) => state.dayRanges);
  const setMonth = useMetricsStore((state) => state.setMonth);
  const selectProjects = useMetricsStore((state) => state.selectProjects);
  const setPeople = useMetricsStore((state) => state.setPeople);
  const setCompareMonths = useMetricsStore((state) => state.setCompareMonths);
  const setDayRange = useMetricsStore((state) => state.setDayRange);
  const setScope = useMetricsStore((state) => state.setScope);

  let peopleHint: string;
  if (membersFailed) peopleHint = 'Não foi possível carregar as pessoas da squad.';
  else if (!hasSquads && usersFailed) peopleHint = 'Não foi possível carregar as pessoas do Jira.';
  else if (isAllPeople) {
    peopleHint = hasSquads
      ? 'Quem lançou horas na squad e quem pode ser responsável nela, mesmo sem horas.'
      : 'Todas as pessoas do Jira, com as horas em qualquer projeto.';
  } else if (selectedPeople.length > 0) {
    peopleHint = hasSquads ? 'Só as pessoas escolhidas.' : 'Só as pessoas escolhidas, com as horas em qualquer projeto.';
  } else if (!hasSquads) peopleHint = 'Sem squad e sem pessoa, nada é buscado.';
  else {
    const count = contributors.length > 0 ? ` (${plural(contributors.length, 'pessoa', 'pessoas')})` : '';
    peopleHint = `Sem escolha: quem lançou horas na squad nos meses comparados${count}.`;
  }

  let squadsHint: string | undefined;
  if (projectsFailed) squadsHint = 'Não foi possível carregar as squads.';
  else if (projectKeys?.length === 0) squadsHint = 'Sem squad: só as pessoas escolhidas, com as horas em qualquer projeto.';

  return (
    <div className={styles.panel} role="search" aria-label="Filtros do Metrics">
      <FormField label="Mês" htmlFor={monthId}>
        <MonthField
          id={monthId}
          value={month}
          max={currentMonth}
          // O mês padrão fica salvo como "padrão": na virada do mês, a tela acompanha.
          onChange={(next) => setMonth(next === defaultMonth ? null : next)}
        />
      </FormField>

      <FormField label="Squads" htmlFor={squadId} hint={squadsHint}>
        <SquadMultiSelect
          inputId={squadId}
          projects={projects}
          projectKeys={projectKeys ?? []}
          connectedSquad={connectedSquad}
          isLoading={isLoadingProjects}
          onChange={selectProjects}
        />
      </FormField>

      <FormField label="Pessoas" htmlFor={peopleId} hint={peopleHint}>
        <PeoplePicker
          inputId={peopleId}
          hasSquads={hasSquads}
          contributors={contributors}
          members={members}
          allUsers={allUsers}
          isLoadingUsers={isLoadingUsers}
          usersFailed={usersFailed}
          isAllPeople={isAllPeople}
          selected={selectedPeople}
          onChange={(people) => projectKeys && setPeople(projectKeys, people)}
        />
      </FormField>

      <LabeledSelect
        label="Comparar"
        value={`${compareMonths}`}
        options={COMPARE_OPTIONS}
        onChange={(value) => setCompareMonths(Number(value) as CompareMonths)}
      />

      <DayRangesField ranges={dayRanges} onChange={setDayRange} />

      {/* Sem squad, as horas são sempre em qualquer projeto. */}
      {hasSquads && <LabeledSelect label="Horas" value={scope} options={SCOPE_OPTIONS} onChange={setScope} />}

      <p className={styles.note}>
        Dias úteis: segunda a sexta, sem os feriados nacionais, o Carnaval e o Corpus Christi. Férias, folgas e feriados
        locais não entram na conta.
      </p>
    </div>
  );
}
