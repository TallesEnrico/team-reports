import { useMemo } from 'react';
import { useJiraWriteAccess } from '../../../api/useJiraWriteAccessQuery';
import { AppShell } from '../../../components/AppShell';
import { IssueDialog } from '../../../components/IssueDialog';
import type { SelectOption } from '../../../components/LabeledSelect';
import { SidebarHeader } from '../../../components/SidebarHeader';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { useOpenIssue } from '../../../hooks/useOpenIssue';
import { defaultReportTimeZone } from '../../../lib/timeZones';
import { ConnectionStatus } from '../../jira-connection/components/ConnectionStatus';
import { useStoryEpicsQuery } from '../api/useStoryEpicsQuery';
import { useKanbanBoard } from '../hooks/useKanbanBoard';
import { boardMeta } from '../lib/boardMeta';
import { buildBoardView, doneColumnIds, hasActiveFilters } from '../lib/boardView';
import { buildSheetView } from '../lib/sheetView';
import { buildSwimlanes, type EpicsByStory, storiesMissingEpic } from '../lib/swimlanes';
import { useKanbanStore, useKanbanStoreHydrated } from '../store/useKanbanStore';
import { type KanbanGroupBy, nextDoneWindow, type SheetGroupBy } from '../types';
import { BoardGate } from './BoardGate';
import { BoardHeader } from './BoardHeader';
import { BoardNotices } from './BoardNotices';
import { CreateStoryButton } from './CreateStoryButton';
import { IssueSheet } from './IssueSheet';
import { KanbanBoard } from './KanbanBoard';
import { KanbanFiltersPanel } from './KanbanFiltersPanel';
import styles from './KanbanPage.module.css';
import { LoadMoreDone } from './LoadMoreDone';
import { ViewModeToggle } from './ViewModeToggle';

const BOARD_GROUP_BY_OPTIONS: SelectOption<KanbanGroupBy>[] = [
  { value: 'parent', label: 'Issue pai' },
  { value: 'story', label: 'História' },
  { value: 'none', label: 'Nenhum' },
];

const SHEET_GROUP_BY_OPTIONS: SelectOption<SheetGroupBy>[] = [
  { value: 'column', label: 'Coluna do quadro' },
  { value: 'parent', label: 'Issue pai' },
  { value: 'none', label: 'Nenhum' },
];

// Horários lançados pelo quadro: no fuso do navegador (entre os aceitos pelo app).
const timeZone = defaultReportTimeZone();
const NO_EPICS: EpicsByStory = {};

/**
 * Quadro da squad em duas visualizações: colunas com cards (Kanban) ou
 * planilha (Spreadsheet). Squad, quadro, pessoas, concluídas e filtros valem
 * para as duas; agrupamento é de cada uma.
 */
export function KanbanPage() {
  const isHydrated = useKanbanStoreHydrated();
  const kanban = useKanbanBoard();
  const viewMode = useKanbanStore((state) => state.viewMode);
  const setViewMode = useKanbanStore((state) => state.setViewMode);
  const filters = useKanbanStore((state) => state.filters);
  const groupBy = useKanbanStore((state) => state.groupBy);
  const setGroupBy = useKanbanStore((state) => state.setGroupBy);
  const loadMoreDone = useKanbanStore((state) => state.loadMoreDone);
  const sheetGroupBy = useKanbanStore((state) => state.sheetGroupBy);
  const setSheetGroupBy = useKanbanStore((state) => state.setSheetGroupBy);
  const sheetSort = useKanbanStore((state) => state.sheetSort);
  const setSheetSort = useKanbanStore((state) => state.setSheetSort);
  const sheetColumns = useKanbanStore((state) => state.sheetColumns);
  const setSheetColumns = useKanbanStore((state) => state.setSheetColumns);
  const sheetColumnWidths = useKanbanStore((state) => state.sheetColumnWidths);
  const setSheetColumnWidth = useKanbanStore((state) => state.setSheetColumnWidth);
  const { canWrite, isReadOnly } = useJiraWriteAccess();
  const isSheet = viewMode === 'sheet';
  useDocumentTitle(isSheet ? 'Spreadsheet' : 'Kanban');

  const { configuration, issues } = kanban;
  // Modal no endereço (/kanban?issue=CLI-5151); com a issue no quadro, o modal acompanha o card (ou a linha).
  const openIssue = useOpenIssue(issues);
  const views = useMemo(
    () => (!isSheet && configuration && issues ? buildBoardView(configuration.columns, issues, filters, groupBy) : undefined),
    [isSheet, configuration, issues, filters, groupBy],
  );
  const sheetView = useMemo(
    () =>
      isSheet && configuration && issues
        ? buildSheetView(configuration.columns, issues, filters, sheetGroupBy, sheetSort)
        : undefined,
    [isSheet, configuration, issues, filters, sheetGroupBy, sheetSort],
  );
  // Por história o quadro vira raias; o épico das histórias que não estão entre os cards vem de outra busca.
  const isStoryLanes = !isSheet && groupBy === 'story';
  const missingEpicKeys = useMemo(
    () => (isStoryLanes && issues ? storiesMissingEpic(issues) : []),
    [isStoryLanes, issues],
  );
  const epics = useStoryEpicsQuery(missingEpicKeys, isStoryLanes).data ?? NO_EPICS;
  const lanes = useMemo(
    () => (isStoryLanes && configuration && issues ? buildSwimlanes(configuration.columns, issues, filters, epics) : undefined),
    [isStoryLanes, configuration, issues, filters, epics],
  );
  const isFiltered = hasActiveFilters(filters);

  // "Carregar mais" das concluídas, depois do último card: no quadro, nas colunas
  // de concluídas (ou embaixo das raias); na planilha, depois da última linha.
  const { doneWindow, isLoadingMoreDone } = kanban;
  const loadMoreProps = { doneWindow, isLoading: isLoadingMoreDone, onLoadMore: loadMoreDone };
  // Mesmo elemento enquanto nada muda: as colunas (memo) não redesenham.
  const boardLoadMore = useMemo(
    () =>
      !isSheet && configuration && issues
        ? {
            columnIds: doneColumnIds(configuration.columns, issues),
            content: <LoadMoreDone doneWindow={doneWindow} isLoading={isLoadingMoreDone} onLoadMore={loadMoreDone} />,
          }
        : undefined,
    [isSheet, configuration, issues, doneWindow, isLoadingMoreDone, loadMoreDone],
  );

  const counts = isSheet
    ? sheetView && { shown: sheetView.shown, total: sheetView.total }
    : views && {
        shown: views.reduce((sum, view) => sum + view.shown, 0),
        total: views.reduce((sum, view) => sum + view.total, 0),
      };
  const meta = boardMeta(kanban, counts ? { ...counts, isFiltered } : undefined);
  const isReady = Boolean(configuration && (isSheet ? sheetView : views) && isHydrated);

  const headerProps = {
    meta,
    leading: <ViewModeToggle value={viewMode} onChange={setViewMode} />,
    extra: kanban.projectKey ? <CreateStoryButton projectKey={kanban.projectKey} canWrite={canWrite} /> : undefined,
    isRefreshing: kanban.isRefreshing,
    canRefresh: Boolean(configuration),
    onRefresh: () => void kanban.refresh(),
  };

  return (
    <AppShell
      sidebar={
        <>
          <SidebarHeader />
          <KanbanFiltersPanel />
        </>
      }
      sidebarFooter={<ConnectionStatus />}
      mainClassName={styles.main}
    >
      {isSheet ? (
        <BoardHeader
          {...headerProps}
          product="spreadsheet"
          groupBy={sheetGroupBy}
          groupByOptions={SHEET_GROUP_BY_OPTIONS}
          onGroupByChange={setSheetGroupBy}
        />
      ) : (
        <BoardHeader
          {...headerProps}
          product="kanban"
          groupBy={groupBy}
          groupByOptions={BOARD_GROUP_BY_OPTIONS}
          onGroupByChange={setGroupBy}
        />
      )}
      <BoardNotices
        board={kanban}
        showReadOnly={Boolean(counts) && isReadOnly}
        readOnlyAction={isSheet ? 'trocar o status e lançar horas' : 'mover cards e lançar horas'}
        openIssueFailure={openIssue.failure}
        className={styles.notice}
      />
      <section className={styles.board} aria-label={isSheet ? 'Planilha do quadro' : 'Quadro'}>
        <BoardGate
          board={kanban}
          toolName="Kanban"
          isReady={isReady}
          totalCount={counts?.total ?? 0}
          loadMore={nextDoneWindow(doneWindow) ? <LoadMoreDone {...loadMoreProps} /> : undefined}
        >
          {() =>
            isSheet ? (
              <IssueSheet
                view={sheetView!}
                columns={sheetColumns}
                onColumnsChange={setSheetColumns}
                widths={sheetColumnWidths}
                onWidthChange={setSheetColumnWidth}
                sort={sheetSort}
                onSortChange={setSheetSort}
                isFiltered={isFiltered}
                canChangeStatus={canWrite}
                isRefreshing={kanban.isRefreshing}
                footer={<LoadMoreDone {...loadMoreProps} layout="inline" />}
                issueHref={openIssue.hrefFor}
                onOpenIssue={openIssue.open}
              />
            ) : (
              <KanbanBoard
                // Recomeça o estado de arrasto ao trocar de quadro.
                key={configuration!.boardId}
                columns={configuration!.columns}
                views={views!}
                lanes={lanes}
                isFiltered={isFiltered}
                canDrag={canWrite}
                isRefreshing={kanban.isRefreshing}
                loadMore={boardLoadMore}
                onOpenIssue={openIssue.open}
              />
            )
          }
        </BoardGate>
      </section>

      {openIssue.issue && (
        <IssueDialog
          // Outra issue (ex: a pai, aberta de dentro do modal) recomeça o modal do zero.
          key={openIssue.issue.id}
          issue={openIssue.issue}
          timeZone={timeZone}
          onOpenIssue={openIssue.open}
          onClose={openIssue.close}
        />
      )}
    </AppShell>
  );
}
