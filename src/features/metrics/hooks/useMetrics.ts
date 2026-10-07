import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useAllUsersQuery } from '../../../api/useAllUsersQuery';
import { useProjectsQuery } from '../../../api/useProjectsQuery';
import { useSquadsMembersQuery } from '../../../api/useSquadMembersQuery';
import { todayKey } from '../../../lib/dates';
import { previousWorkday } from '../../../lib/holidays';
import { defaultReportTimeZone } from '../../../lib/timeZones';
import { useJiraConnectionStore } from '../../../store/useJiraConnectionStore';
import { metricsKeys } from '../api/queryKeys';
import { useOtherProjectsMonthsQueries, useSquadMonthsQueries } from '../api/useMonthWorklogsQueries';
import { buildMetrics } from '../lib/buildMetrics';
import { monthOf, monthsUpTo } from '../lib/months';
import { squadsKey, useMetricsStore, useMetricsStoreHydrated } from '../store/useMetricsStore';
import type { JiraUser, MonthWorklogs } from '../types';

/** Datas e horários no fuso do navegador, entre os aceitos pelo app (como no Kanban). */
export const METRICS_TIME_ZONE = defaultReportTimeZone();

const NO_IDS: string[] = [];
const collator = new Intl.Collator('pt-BR');

function byName(a: JiraUser, b: JiraUser): number {
  return collator.compare(a.displayName, b.displayName);
}

/** Apontamentos das contas juntadas passam a ser da conta principal (a pessoa é uma só). */
function withMergedAccounts(month: MonthWorklogs, mergedAccounts: Record<string, string>): MonthWorklogs {
  if (!month.worklogs.some((worklog) => mergedAccounts[worklog.authorId])) return month;
  return {
    ...month,
    worklogs: month.worklogs.map((worklog) =>
      mergedAccounts[worklog.authorId] ? { ...worklog, authorId: mergedAccounts[worklog.authorId] } : worklog,
    ),
  };
}

/** Junta as horas nas squads com as dos outros projetos (buscas diferentes, sem issues em comum). */
function mergeMonth(squad: MonthWorklogs, others: MonthWorklogs): MonthWorklogs {
  const issues = new Map([...squad.issues, ...others.issues].map((issue) => [issue.id, issue]));
  const worklogs = new Map([...squad.worklogs, ...others.worklogs].map((worklog) => [worklog.id, worklog]));
  return { issues: [...issues.values()], worklogs: [...worklogs.values()], authors: { ...others.authors, ...squad.authors } };
}

/**
 * Indicadores da tela: as squads escolhidas (ou a da conta), os meses (o escolhido
 * e os anteriores da comparação), a equipe e as horas dela em cada mês.
 *
 * Equipe: as pessoas escolhidas na lateral ou, sem escolha, quem lançou horas
 * em issues das squads em algum dos meses comparados. As horas da equipe contam
 * em qualquer projeto (ex: reuniões num projeto à parte), a menos que a lateral
 * peça só as das squads. "Todas as pessoas" junta quem lançou horas nas squads e
 * quem pode ser responsável nelas (sem squad, todas as pessoas do Jira). Sem
 * squad, a equipe são só as pessoas escolhidas, com as horas em qualquer projeto;
 * sem squad e sem pessoa, nada é buscado. Contas
 * juntadas (a mesma pessoa com duas contas no Jira) viram uma pessoa só, com as
 * horas das duas.
 */
export function useMetrics() {
  const today = todayKey(METRICS_TIME_ZONE);
  const currentMonth = monthOf(today);

  const connectedSquad = useJiraConnectionStore((state) => state.credentials?.squad);
  const savedProjectKeys = useMetricsStore((state) => state.projectKeys);
  const projectsQuery = useProjectsQuery();
  const loadedProjects = projectsQuery.data;
  const projects = useMemo(() => loadedProjects ?? [], [loadedProjects]);
  // Antes de ler as squads e as preferências salvas, nada é buscado (seriam os padrões, trocados em seguida).
  const isHydrated = useMetricsStoreHydrated();
  const projectKeys = useMemo(() => {
    if (!isHydrated) return undefined;
    // Nenhuma squad, de propósito: só as pessoas escolhidas.
    if (savedProjectKeys?.length === 0) return savedProjectKeys;
    // Squads salvas que a conta não enxerga (ex: outra conta conectada depois) saem; sem nenhuma, vale a squad da conta.
    const visible = loadedProjects
      ? savedProjectKeys?.filter((key) => loadedProjects.some((project) => project.key === key))
      : savedProjectKeys;
    if (visible?.length) return visible;
    return connectedSquad ? [connectedSquad] : [];
  }, [isHydrated, savedProjectKeys, loadedProjects, connectedSquad]);
  const hasSquads = Boolean(projectKeys?.length);
  // Enquanto a lista de projetos carrega, a squad aparece pela chave.
  const squads = useMemo(
    () => projectKeys?.map((key) => projects.find((project) => project.key === key) ?? { key, name: key }) ?? [],
    [projectKeys, projects],
  );

  // Padrão: o mês do último dia útil que já passou. No dia 1º (ou antes do primeiro dia útil), o mês
  // anterior: o atual ainda não tem nenhum dia para cobrar.
  const defaultMonth = monthOf(previousWorkday(today));
  const savedMonth = useMetricsStore((state) => state.month);
  const month = savedMonth && savedMonth <= currentMonth ? savedMonth : defaultMonth;
  const compareMonths = useMetricsStore((state) => state.compareMonths);
  // Sem squad, "só nas issues da squad" não deixaria nada.
  const savedScope = useMetricsStore((state) => state.scope);
  const scope = hasSquads ? savedScope : 'all';
  const dayRanges = useMetricsStore((state) => state.dayRanges);
  const peopleChoice = useMetricsStore((state) =>
    projectKeys ? state.peopleByProject[squadsKey(projectKeys)] : undefined,
  );
  const isAllPeople = peopleChoice === 'all';
  const selectedIds = Array.isArray(peopleChoice) ? peopleChoice : NO_IDS;
  const mergedAccounts = useMetricsStore((state) => state.mergedAccounts);
  const knownPeople = useMetricsStore((state) => state.knownPeople);
  /** Sem squad e sem pessoa escolhida: nada a buscar. */
  const isIdle = projectKeys?.length === 0 && selectedIds.length === 0 && !isAllPeople;
  const months = useMemo(() => monthsUpTo(month, compareMonths), [month, compareMonths]);

  const squadMonths = useSquadMonthsQueries(months, projectKeys, currentMonth);
  const isSquadLoaded = squadMonths.data.every(Boolean);

  // Quem lançou horas nas squads nos meses comparados (a equipe sem escolha), já pela conta principal.
  const contributorIds = useMemo(() => {
    const loggedInMonth = new Set(squadMonths.data[0]?.worklogs.map((worklog) => worklog.authorId));
    const ids = new Set<string>();
    for (const data of squadMonths.data) {
      for (const user of Object.values(data?.authors ?? {})) {
        // Conta desativada não lança mais: sem horas no mês, ficaria como "sem lançar" para sempre.
        if (user.active === false && !mergedAccounts[user.accountId] && !loggedInMonth.has(user.accountId)) continue;
        ids.add(mergedAccounts[user.accountId] ?? user.accountId);
      }
    }
    return [...ids].sort();
  }, [squadMonths.data, mergedAccounts]);

  const membersQuery = useSquadsMembersQuery(projectKeys);
  const allUsersQuery = useAllUsersQuery();

  // "Todas as pessoas": com squad, quem lançou horas nela e quem pode ser responsável nela; sem squad, todas as do Jira.
  const allPeopleIds = useMemo(() => {
    if (!isAllPeople) return undefined;
    const primary = (user: JiraUser) => mergedAccounts[user.accountId] ?? user.accountId;
    if (hasSquads) {
      if (!isSquadLoaded || membersQuery.isPending) return undefined;
      return [...new Set([...contributorIds, ...membersQuery.data.map(primary)])].sort();
    }
    return allUsersQuery.data && [...new Set(allUsersQuery.data.map(primary))].sort();
  }, [
    isAllPeople,
    mergedAccounts,
    hasSquads,
    isSquadLoaded,
    membersQuery.isPending,
    membersQuery.data,
    contributorIds,
    allUsersQuery.data,
  ]);

  // Sem escolha, a equipe só fica definida com todos os meses das squads carregados.
  const rosterIds = useMemo(() => {
    if (isAllPeople) return allPeopleIds;
    if (selectedIds.length > 0) return [...new Set(selectedIds.map((id) => mergedAccounts[id] ?? id))].sort();
    return hasSquads && isSquadLoaded ? contributorIds : undefined;
  }, [isAllPeople, allPeopleIds, selectedIds, mergedAccounts, hasSquads, isSquadLoaded, contributorIds]);

  // Contas buscadas nos outros projetos: as da equipe e as juntadas a elas.
  const accountIds = useMemo(() => {
    if (!rosterIds) return undefined;
    const roster = new Set(rosterIds);
    const linked = Object.keys(mergedAccounts).filter((id) => roster.has(mergedAccounts[id]));
    return [...new Set([...rosterIds, ...linked])].sort();
  }, [rosterIds, mergedAccounts]);

  const otherMonths = useOtherProjectsMonthsQueries(
    months,
    projectKeys,
    scope === 'all' ? accountIds : undefined,
    currentMonth,
  );

  const data = useMemo(
    () =>
      squadMonths.data.map((squad, index) => {
        const others = otherMonths.data[index];
        // Sem squad, só as horas das pessoas escolhidas (em qualquer projeto).
        if (!hasSquads) return others && withMergedAccounts(others, mergedAccounts);
        if (!squad || scope === 'squad' || (rosterIds && rosterIds.length === 0)) {
          return squad && withMergedAccounts(squad, mergedAccounts);
        }
        return others && withMergedAccounts(mergeMonth(squad, others), mergedAccounts);
      }),
    [squadMonths.data, otherMonths.data, hasSquads, scope, rosterIds, mergedAccounts],
  );

  // Nome e foto: o salvo na escolha, depois o das pessoas do Jira e da squad e, por último, o dos apontamentos (o mais novo).
  const directory = useMemo(() => {
    const byId = new Map<string, JiraUser>(Object.entries(knownPeople));
    for (const user of allUsersQuery.data ?? []) byId.set(user.accountId, user);
    for (const user of membersQuery.data) byId.set(user.accountId, user);
    for (const month of [...squadMonths.data, ...otherMonths.data]) {
      for (const user of Object.values(month?.authors ?? {})) byId.set(user.accountId, user);
    }
    return byId;
  }, [knownPeople, allUsersQuery.data, membersQuery.data, squadMonths.data, otherMonths.data]);
  const userOf = useCallback(
    (accountId: string): JiraUser => directory.get(accountId) ?? { accountId, displayName: 'Pessoa sem nome no Jira' },
    [directory],
  );

  // Opções de "Pessoas": quem lançou nas squads e quem pode ser responsável nelas, sem as contas juntadas.
  const contributors = useMemo(() => contributorIds.map(userOf).sort(byName), [contributorIds, userOf]);
  const members = useMemo(
    () => membersQuery.data.filter((user) => !mergedAccounts[user.accountId]),
    [membersQuery.data, mergedAccounts],
  );
  const allUsers = useMemo(
    () => (allUsersQuery.data ?? []).filter((user) => !mergedAccounts[user.accountId]),
    [allUsersQuery.data, mergedAccounts],
  );

  /** Contas juntadas a cada conta principal. */
  const linkedAccounts = useMemo(() => {
    const byPrimary: Record<string, JiraUser[]> = {};
    for (const [accountId, primary] of Object.entries(mergedAccounts)) (byPrimary[primary] ??= []).push(userOf(accountId));
    return byPrimary;
  }, [mergedAccounts, userOf]);

  const roster = useMemo(() => rosterIds?.map(userOf).sort(byName), [rosterIds, userOf]);
  const selectedPeople = useMemo(() => selectedIds.map(userOf), [selectedIds, userOf]);

  const model = useMemo(
    () =>
      projectKeys && roster && !isIdle
        ? buildMetrics({
            months,
            data,
            roster,
            projectKeys,
            scope,
            dayRanges,
            timeZone: METRICS_TIME_ZONE,
            today,
          })
        : undefined,
    [projectKeys, roster, isIdle, months, data, scope, dayRanges, today],
  );

  const queryClient = useQueryClient();
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: metricsKeys.root() }), [queryClient]);

  return {
    today,
    currentMonth,
    defaultMonth,
    month,
    months,
    connectedSquad,
    projectKeys,
    /** As squads escolhidas, com o nome (enquanto a lista carrega, só a chave). */
    squads,
    hasSquads,
    /** Sem squad e sem pessoa escolhida: nada é buscado. */
    isIdle,
    /** O recorte das horas valendo (sem squad, sempre em qualquer projeto). */
    scope,
    projects,
    projectsQuery,
    members,
    membersQuery,
    /** Todas as pessoas do Jira (opções de "Pessoas" fora da squad), sem as contas juntadas. */
    allUsers,
    allUsersQuery,
    contributors,
    /** "Todas as pessoas" escolhida em "Pessoas". */
    isAllPeople,
    selectedIds,
    /** As pessoas escolhidas, com nome e foto. */
    selectedPeople,
    roster,
    linkedAccounts,
    /** Meses já carregados por completo. */
    loadedMonths: data.filter(Boolean).length,
    /** Buscas concluídas (horas nas squads e, depois, nos outros projetos), para o aviso de carregamento. */
    progress: {
      done:
        (hasSquads ? squadMonths.data.filter(Boolean).length : 0) +
        (scope === 'all' && accountIds?.length ? otherMonths.data.filter(Boolean).length : 0),
      total: months.length * ((hasSquads ? 1 : 0) + (scope === 'all' ? 1 : 0)),
    },
    model,
    error: squadMonths.error ?? otherMonths.error ?? (isAllPeople && !hasSquads ? allUsersQuery.error : null),
    isFetching: squadMonths.isFetching || otherMonths.isFetching,
    refresh,
  };
}
