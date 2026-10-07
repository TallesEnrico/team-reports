import { CircleNotch, Funnel, PlugsConnected, UsersThree, WarningCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { JiraApiError } from '../../../api/jira-client';
import { AppShell } from '../../../components/AppShell';
import { IssueDialog } from '../../../components/IssueDialog';
import { Notice } from '../../../components/Notice';
import { PageMessage } from '../../../components/PageMessage';
import { RefreshOverlay } from '../../../components/RefreshOverlay';
import { SidebarHeader } from '../../../components/SidebarHeader';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { useOpenIssue } from '../../../hooks/useOpenIssue';
import type { DateKey } from '../../../lib/dates';
import { reportTimeZoneLabel } from '../../../lib/timeZones';
import { useIsJiraConnected } from '../../../store/useJiraConnectionStore';
import { ConnectionStatus } from '../../jira-connection/components/ConnectionStatus';
import { METRICS_TIME_ZONE, useMetrics } from '../hooks/useMetrics';
import type { MetricsModel } from '../lib/buildMetrics';
import { capitalizeFirst, formatList, plural } from '../lib/format';
import { formatMonthLong } from '../lib/months';
import { useMetricsStore } from '../store/useMetricsStore';
import { DailyHoursChart } from './DailyHoursChart';
import { MetricsFiltersPanel } from './MetricsFiltersPanel';
import { MetricsHeader } from './MetricsHeader';
import styles from './MetricsPage.module.css';
import { MonthlyChart } from './MonthlyChart';
import { PeopleSection } from './PeopleSection';
import { PersonDialog } from './PersonDialog';
import { ProjectHoursCard } from './ProjectHoursCard';
import { StatTiles } from './StatTiles';
import { TopIssuesCard } from './TopIssuesCard';

function errorMessages(error: Error): string[] {
  return error instanceof JiraApiError ? error.messages : [error.message];
}

export function MetricsPage() {
  useDocumentTitle('Metrics');
  const isConnected = useIsJiraConnected();
  const metrics = useMetrics();
  const personFilter = useMetricsStore((state) => state.personFilter);
  const setPersonFilter = useMetricsStore((state) => state.setPersonFilter);
  const sort = useMetricsStore((state) => state.sort);
  const setSort = useMetricsStore((state) => state.setSort);
  const { scope } = metrics;
  const mergeAccounts = useMetricsStore((state) => state.mergeAccounts);
  const splitAccount = useMetricsStore((state) => state.splitAccount);

  // Trocando o mês, as squads ou as pessoas, o painel anterior fica na tela, esmaecido, até o novo chegar.
  const [lastModel, setLastModel] = useState<MetricsModel | undefined>(metrics.model);
  if (metrics.model && metrics.model !== lastModel) setLastModel(metrics.model);
  // Sem conta (ex: "Sair") ou sem squad e sem pessoa, o painel anterior sai da tela.
  const isEmpty = !isConnected || metrics.isIdle;
  if (isEmpty && lastModel) setLastModel(undefined);
  const model = isEmpty ? undefined : (metrics.model ?? lastModel);
  const isStale = !metrics.model && Boolean(model);
  const isRefreshing = isStale || (metrics.isFetching && metrics.loadedMonths === metrics.months.length);

  // Modal da issue no endereço (/metrics?issue=CLI-5151), como nas outras telas.
  const openIssue = useOpenIssue(model?.issues);
  const [personView, setPersonView] = useState<{ accountId: string; day?: DateKey } | null>(null);
  const openPerson = personView && model?.people.find((person) => person.user.accountId === personView.accountId);

  const squadNames = formatList(metrics.squads.map((squad) => squad.name));
  const hasManySquads = metrics.squads.length > 1;
  const meta = [
    squadNames ? `${hasManySquads ? 'Squads' : 'Squad'} ${squadNames}` : '',
    model ? plural(model.people.length, 'pessoa', 'pessoas') : '',
    capitalizeFirst(formatMonthLong(model?.month ?? metrics.month)),
    scope === 'squad' ? `Só horas ${hasManySquads ? 'nas squads' : 'na squad'}` : '',
    `Fuso ${reportTimeZoneLabel(METRICS_TIME_ZONE)}`,
  ].filter(Boolean);

  const oldest = metrics.months[metrics.months.length - 1];
  const pendingMonths = model ? model.monthly.filter((month) => !month.isLoaded).length : 0;

  let content;
  if (!isConnected) {
    content = (
      <PageMessage tone="neutral" icon={<PlugsConnected size={20} weight="bold" />} title="Conecte sua conta do Jira">
        Os indicadores da squad aparecem assim que a conexão for concluída.
      </PageMessage>
    );
  } else if (metrics.isIdle) {
    content = (
      <PageMessage tone="neutral" icon={<Funnel size={20} weight="bold" />} title="Escolha as squads ou as pessoas">
        Sem squad e sem pessoa escolhida, nada é buscado. Escolha uma squad em "Squads" ou busque pessoas em "Pessoas",
        na lateral.
      </PageMessage>
    );
  } else if (metrics.error && !model) {
    content = (
      <PageMessage tone="error" icon={<WarningCircle size={20} weight="bold" />} title="Não foi possível carregar as horas">
        <ul>
          {errorMessages(metrics.error).map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </PageMessage>
    );
  } else if (!model) {
    content = (
      <PageMessage
        tone="loading"
        icon={<CircleNotch size={20} weight="bold" />}
        title={
          metrics.hasSquads ? `Buscando as horas ${hasManySquads ? 'das squads' : 'da squad'}` : 'Buscando as horas das pessoas'
        }
      >
        Apontamentos de {formatMonthLong(oldest)} a {formatMonthLong(metrics.month)} ({metrics.progress.done} de{' '}
        {metrics.progress.total} buscas concluídas). Depois da primeira vez, os meses ficam em cache.
      </PageMessage>
    );
  } else if (model.people.length === 0) {
    content = (
      <PageMessage
        tone="neutral"
        icon={<UsersThree size={20} weight="bold" />}
        title={`Ninguém lançou horas ${hasManySquads ? 'nas squads' : 'na squad'}`}
      >
        Nenhum apontamento em issues {hasManySquads ? 'das squads' : 'da squad'} {squadNames} de {formatMonthLong(oldest)} a{' '}
        {formatMonthLong(model.month)}.
        Escolha as pessoas em "Pessoas", na lateral, ou compare mais meses.
      </PageMessage>
    );
  } else {
    content = (
      <div className={styles.dashboard} data-stale={isStale || undefined}>
        <StatTiles model={model} personFilter={personFilter} onPersonFilterChange={setPersonFilter} />

        <PeopleSection
          model={model}
          filter={personFilter}
          onFilterChange={setPersonFilter}
          sort={sort}
          onSortChange={setSort}
          today={metrics.today}
          linkedAccounts={metrics.linkedAccounts}
          onOpenPerson={(person, day) => setPersonView({ accountId: person.user.accountId, day })}
        />

        <div className={styles.chartsRow}>
          <DailyHoursChart model={model} />
          <MonthlyChart
            title="Mês a mês"
            subtitle={
              pendingMonths > 0
                ? `Carregando ${plural(pendingMonths, 'mês anterior', 'meses anteriores')}…`
                : 'Lançado contra o esperado; acima das colunas, a cobertura.'
            }
            months={model.monthly.map((month) => ({
              ...month,
              workdays: { elapsed: month.elapsedWorkdays, total: month.totalWorkdays },
            }))}
            selectedMonth={model.month}
          />
        </div>

        <div className={styles.listsRow}>
          <ProjectHoursCard model={model} />
          <TopIssuesCard model={model} issueHref={openIssue.hrefFor} onOpenIssue={openIssue.open} />
        </div>
      </div>
    );
  }

  return (
    <AppShell
      sidebar={
        <>
          <SidebarHeader />
          <MetricsFiltersPanel
            month={metrics.month}
            currentMonth={metrics.currentMonth}
            defaultMonth={metrics.defaultMonth}
            projectKeys={metrics.projectKeys}
            hasSquads={metrics.hasSquads}
            connectedSquad={metrics.connectedSquad}
            projects={metrics.projects}
            isLoadingProjects={metrics.projectsQuery.isLoading}
            projectsFailed={metrics.projectsQuery.isError}
            contributors={metrics.contributors}
            members={metrics.members}
            membersFailed={metrics.membersQuery.isError}
            allUsers={metrics.allUsers}
            isLoadingUsers={metrics.allUsersQuery.isLoading}
            usersFailed={metrics.allUsersQuery.isError}
            isAllPeople={metrics.isAllPeople}
            selectedPeople={metrics.selectedPeople}
            scope={scope}
          />
        </>
      }
      sidebarFooter={<ConnectionStatus />}
      mainClassName={styles.main}
    >
      <MetricsHeader
        meta={meta}
        isRefreshing={isRefreshing}
        canRefresh={isConnected && Boolean(metrics.projectKeys) && !metrics.isIdle}
        onRefresh={() => void metrics.refresh()}
        canPrint={Boolean(model?.people.length)}
      />
      {openIssue.failure && (
        <Notice tone="warning" className={styles.notice}>
          Não foi possível abrir a issue {openIssue.failure.key} do endereço: {openIssue.failure.message}
        </Notice>
      )}
      {metrics.error && model && (
        <Notice tone="warning" className={styles.notice}>
          Parte dos meses não carregou: {errorMessages(metrics.error)[0]} Use "Atualizar" para tentar de novo.
        </Notice>
      )}

      <section className={styles.content} aria-label="Indicadores">
        {model && isRefreshing && (
          <div className={styles.refreshing}>
            <RefreshOverlay />
          </div>
        )}
        {content}
      </section>

      {openPerson && model && !openIssue.issue && (
        <PersonDialog
          key={openPerson.user.accountId}
          person={openPerson}
          model={model}
          selectedDay={personView?.day}
          onSelectDay={(day) => setPersonView({ accountId: openPerson.user.accountId, day })}
          today={metrics.today}
          timeZone={METRICS_TIME_ZONE}
          issueHref={openIssue.hrefFor}
          onOpenIssue={openIssue.open}
          linkedAccounts={metrics.linkedAccounts[openPerson.user.accountId] ?? []}
          otherPeople={model.people.map((person) => person.user).filter((user) => user.accountId !== openPerson.user.accountId)}
          onMergeAccount={(accountId) => mergeAccounts(accountId, openPerson.user.accountId)}
          onSplitAccount={splitAccount}
          onClose={() => setPersonView(null)}
        />
      )}
      {openIssue.issue && (
        <IssueDialog
          // Outra issue (ex: a pai, aberta de dentro do modal) recomeça o modal do zero.
          key={openIssue.issue.id}
          issue={openIssue.issue}
          timeZone={METRICS_TIME_ZONE}
          onOpenIssue={openIssue.open}
          // Fechando a issue, volta o modal da pessoa de onde ela foi aberta (se havia um).
          onClose={openIssue.close}
        />
      )}
    </AppShell>
  );
}
