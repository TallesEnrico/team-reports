import type { JiraUser, PeopleSort, PersonFilter } from '../types';
import type { MetricsModel, PersonMetrics } from './buildMetrics';

/** Abaixo disso da jornada esperada, a pessoa entra em "Abaixo da jornada". */
export const BELOW_TARGET_RATIO = 0.9;

export function matchesPersonFilter(person: PersonMetrics, filter: PersonFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'missed-last-workday':
      return person.missedLastWorkday;
    case 'missing-days':
      return person.missingDays.length > 0;
    case 'below-target':
      return person.coverage !== undefined && person.coverage < BELOW_TARGET_RATIO;
    case 'no-hours':
      return person.seconds === 0;
  }
}

export interface PersonFilterOption {
  id: PersonFilter;
  label: string;
  count: number;
}

/** Recortes da lista de pessoas com a contagem de cada um; sem dia útil decorrido, só "Todas". */
export function personFilterOptions(model: MetricsModel): PersonFilterOption[] {
  const count = (filter: PersonFilter) => model.people.filter((person) => matchesPersonFilter(person, filter)).length;
  const options: PersonFilterOption[] = [{ id: 'all', label: 'Todas', count: model.people.length }];
  if (model.lastWorkday) {
    options.push(
      // { id: 'missed-last-workday', label: `Sem lançar em ${formatDayMonth(model.lastWorkday)}`, count: count('missed-last-workday') },
      { id: 'missing-days', label: 'Com dias sem lançamento', count: count('missing-days') },
      { id: 'below-target', label: `Abaixo de ${Math.round(BELOW_TARGET_RATIO * 100)}% da jornada`, count: count('below-target') },
    );
  }
  options.push({ id: 'no-hours', label: 'Sem horas no mês', count: count('no-hours') });
  return options;
}

const collator = new Intl.Collator('pt-BR');

function compareBy(sort: PeopleSort['key'], a: PersonMetrics, b: PersonMetrics): number {
  switch (sort) {
    case 'name':
      return collator.compare(a.user.displayName, b.user.displayName);
    case 'hours':
      return a.seconds - b.seconds;
    case 'coverage':
      return (a.coverage ?? 0) - (b.coverage ?? 0);
    case 'missing':
      return a.missingDays.length - b.missingDays.length;
    case 'last':
      // Sem nenhum lançamento conta como o mais antigo.
      return (a.lastLoggedDay ?? '').localeCompare(b.lastLoggedDay ?? '');
  }
}

/** Ordena pela coluna escolhida; empate, pelo nome. */
export function sortPeople(people: PersonMetrics[], sort: PeopleSort): PersonMetrics[] {
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...people].sort((a, b) => compareBy(sort.key, a, b) * direction || compareBy('name', a, b));
}

function firstNameKey(displayName: string): string {
  return (displayName.trim().split(/\s+/)[0] ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Pessoas da lista com o mesmo primeiro nome (sem acento): candidatas a ser a
 * mesma pessoa com outra conta no Jira (ex: "Pablo" e "Pablo Rieger"). Só sugestão.
 */
export function similarlyNamed(user: JiraUser, others: JiraUser[]): JiraUser[] {
  const key = firstNameKey(user.displayName);
  if (key.length < 3) return [];
  return others.filter((other) => other.accountId !== user.accountId && firstNameKey(other.displayName) === key);
}
