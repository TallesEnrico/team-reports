import { Sparkle, SquaresFour, UploadSimple, X } from '@phosphor-icons/react';
import { ReactFlowProvider } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { Button } from '../../../components/Button';
import { IssueDialog } from '../../../components/IssueDialog';
import { Notice } from '../../../components/Notice';
import { PageMessage } from '../../../components/PageMessage';
import { SidebarHeader } from '../../../components/SidebarHeader';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { useOpenIssue } from '../../../hooks/useOpenIssue';
import { useIsJiraConnected } from '../../../store/useJiraConnectionStore';
import { ConnectionStatus } from '../../jira-connection/components/ConnectionStatus';
import { BUILDER_TIME_ZONE, useBuilderResults } from '../hooks/useBuilderResults';
import { useDashboardTransfer } from '../hooks/useDashboardTransfer';
import { useSharedDashboardLink } from '../hooks/useSharedDashboardLink';
import { DEFAULT_DASHBOARD_PERIOD } from '../lib/periods';
import { useActiveDashboard, useBuilderStore, useBuilderStoreHydrated } from '../store/useBuilderStore';
import type { BuilderEdge, BuilderNode } from '../types';
import { type AiDashboardOutcome, AiDashboardDialog } from './AiDashboardDialog';
import { BuilderContext, type BuilderContextValue } from './BuilderContext';
import { BuilderHeader } from './BuilderHeader';
import styles from './BuilderPage.module.css';
import { BuilderPageFallback } from './BuilderPageFallback';
import { BuilderSidebar } from './BuilderSidebar';
import { BuildView } from './BuildView';
import { DashboardView } from './DashboardView';
import { NewDashboardDialog } from './NewDashboardDialog';
import { SharedLinkDialog } from './SharedLinkDialog';

const NO_NODES: BuilderNode[] = [];
const NO_EDGES: BuilderEdge[] = [];

/**
 * Dashboard: cada pessoa monta o próprio dashboard encaixando peças (dados
 * do Jira → filtrar, agrupar e cruzar → gráficos) e vê o resultado ao vivo.
 */
export function BuilderPage() {
  useDocumentTitle('Dashboard');
  const isHydrated = useBuilderStoreHydrated();
  const isConnected = useIsJiraConnected();
  const dashboard = useActiveDashboard();
  const mode = useBuilderStore((state) => state.mode);
  const setMode = useBuilderStore((state) => state.setMode);
  const selectPiece = useBuilderStore((state) => state.selectPiece);
  const createDashboard = useBuilderStore((state) => state.createDashboard);
  const restoreDashboard = useBuilderStore((state) => state.restoreDashboard);

  const sharedLink = useSharedDashboardLink();
  const { openedWithLink } = sharedLink;

  // Primeira visita: a visão da empresa (todas as squads e pessoas), para ver como as peças se encaixam.
  // Aberta por um link compartilhado, a primeira visita fica só com o dashboard do link.
  useEffect(() => {
    const { seeded, dashboards } = useBuilderStore.getState();
    if (isHydrated && !seeded && dashboards.length === 0 && !openedWithLink) createDashboard('company-month');
  }, [isHydrated, createDashboard, openedWithLink]);
  const [isCreating, setIsCreating] = useState(false);
  const [aiDialog, setAiDialog] = useState<'create' | 'edit' | null>(null);
  // O que a IA fez por último (com o "Desfazer" de uma edição); some ao trocar de dashboard.
  const [aiOutcome, setAiOutcome] = useState<AiDashboardOutcome | null>(null);
  const activeId = dashboard?.id;
  useEffect(() => {
    setAiOutcome((outcome) => (outcome && outcome.dashboardId !== activeId ? null : outcome));
  }, [activeId]);

  const nodes = dashboard?.nodes ?? NO_NODES;
  const edges = dashboard?.edges ?? NO_EDGES;
  const dashboardPeriod = dashboard?.period ?? DEFAULT_DASHBOARD_PERIOD;
  const builder = useBuilderResults(nodes, edges, dashboardPeriod);
  const openIssue = useOpenIssue();
  const transfer = useDashboardTransfer();
  const { pickFile, exportDashboard } = transfer;

  const editPiece = useCallback(
    (nodeId: string) => {
      selectPiece(nodeId);
      setMode('build');
    },
    [selectPiece, setMode],
  );

  const context = useMemo<BuilderContextValue>(
    () => ({
      nodes,
      edges,
      results: builder.results,
      connectedSquad: builder.connectedSquad,
      dashboardPeriod,
      openIssue: openIssue.open,
      issueHref: openIssue.hrefFor,
      editPiece,
      importDashboardFile: pickFile,
      exportDashboard,
      openAiDialog: setAiDialog,
    }),
    [
      nodes,
      edges,
      builder.results,
      builder.connectedSquad,
      dashboardPeriod,
      openIssue.open,
      openIssue.hrefFor,
      editPiece,
      pickFile,
      exportDashboard,
    ],
  );

  // Espera o IndexedDB (poucos ms): antes disso, um clique em "Novo" seria gravado por cima dos dashboards salvos.
  if (!isHydrated) return <BuilderPageFallback />;

  let content;
  if (!dashboard) {
    content = (
      <PageMessage tone="neutral" icon={<SquaresFour size={20} weight="bold" />} title="Nenhum dashboard">
        <p>Peça à IA, comece de um modelo, com as peças já encaixadas, ou monte um do zero.</p>
        <div className={styles.ctas}>
          <Button variant="primary" onClick={() => setIsCreating(true)}>
            Novo dashboard
          </Button>
          <Button variant="secondary" icon={<Sparkle size={16} weight="fill" aria-hidden />} onClick={() => setAiDialog('create')}>
            Criar com IA
          </Button>
          <Button variant="secondary" icon={<UploadSimple size={16} weight="bold" aria-hidden />} onClick={pickFile}>
            Importar de um arquivo
          </Button>
        </div>
      </PageMessage>
    );
  } else if (mode === 'build') {
    content = <BuildView dashboard={dashboard} />;
  } else {
    content = (
      <section className={styles.dashboard} aria-label={dashboard.name}>
        <DashboardView onBuild={() => setMode('build')} />
      </section>
    );
  }

  return (
    <ReactFlowProvider>
      <BuilderContext.Provider value={context}>
        <AppShell
          sidebar={
            <>
              <SidebarHeader />
              <BuilderSidebar showPalette={mode === 'build' && Boolean(dashboard)} />
            </>
          }
          sidebarFooter={<ConnectionStatus />}
          mainClassName={mode === 'build' ? styles.mainBuild : styles.main}
        >
          <BuilderHeader
            dashboard={dashboard}
            mode={mode}
            isRefreshing={builder.isFetching}
            canRefresh={isConnected && nodes.length > 0}
            onRefresh={() => void builder.refresh()}
            onEditWithAi={() => setAiDialog('edit')}
          />
          {transfer.fileInput}
          {transfer.feedback && (
            <div className={styles.feedback}>
              <Notice tone={transfer.feedback.tone} className={styles.feedbackNotice}>
                {transfer.feedback.message}
              </Notice>
              <Button
                variant="ghost"
                className={styles.feedbackClose}
                icon={<X size={14} weight="bold" aria-hidden />}
                aria-label="Fechar o aviso"
                onClick={transfer.clearFeedback}
              />
            </div>
          )}
          {aiOutcome && (
            <div className={styles.feedback}>
              <Notice tone="success" className={styles.feedbackNotice}>
                <strong>{aiOutcome.kind === 'created' ? `Dashboard "${aiOutcome.name}" criado pela IA.` : 'A IA mudou o dashboard.'}</strong>{' '}
                {aiOutcome.summary}
                {aiOutcome.fixes.length > 0 && ` Ajustado no app: ${aiOutcome.fixes.join(' ')}`}
              </Notice>
              {aiOutcome.previous && (
                <Button
                  variant="secondary"
                  className={styles.feedbackAction}
                  title="Volta o dashboard ao que era antes do pedido à IA"
                  onClick={() => {
                    restoreDashboard(aiOutcome.previous!);
                    setAiOutcome(null);
                  }}
                >
                  Desfazer
                </Button>
              )}
              <Button
                variant="ghost"
                className={styles.feedbackClose}
                icon={<X size={14} weight="bold" aria-hidden />}
                aria-label="Fechar o aviso"
                onClick={() => setAiOutcome(null)}
              />
            </div>
          )}
          {!isConnected && (
            <Notice tone="warning" className={styles.notice}>
              Conecte a sua conta do Jira para as peças buscarem os dados. Dá para montar enquanto isso.
            </Notice>
          )}
          {openIssue.failure && (
            <Notice tone="warning" className={styles.notice}>
              Não foi possível abrir a issue {openIssue.failure.key} do endereço: {openIssue.failure.message}
            </Notice>
          )}
          {builder.refreshError && (
            <Notice tone="warning" className={styles.notice}>
              Parte dos dados não atualizou: {builder.refreshError.message} Os números na tela são da busca anterior.
            </Notice>
          )}
          {content}
        </AppShell>
        {isCreating && (
          <div className="nokey">
            <NewDashboardDialog onClose={() => setIsCreating(false)} />
          </div>
        )}
        {aiDialog && (
          <div className="nokey">
            <AiDashboardDialog
              dashboard={aiDialog === 'edit' ? dashboard : undefined}
              onClose={() => setAiDialog(null)}
              onDone={setAiOutcome}
            />
          </div>
        )}
        {sharedLink.shared && (
          <div className="nokey">
            <SharedLinkDialog result={sharedLink.shared} onClose={sharedLink.dismiss} />
          </div>
        )}
        {openIssue.issue && (
          // `nokey`: Backspace num botão do modal não apaga a peça selecionada no quadro.
          <div className="nokey">
            <IssueDialog
              // Outra issue (ex: a pai, aberta de dentro do modal) recomeça o modal do zero.
              key={openIssue.issue.id}
              issue={openIssue.issue}
              timeZone={BUILDER_TIME_ZONE}
              onOpenIssue={openIssue.open}
              onClose={openIssue.close}
            />
          </div>
        )}
      </BuilderContext.Provider>
    </ReactFlowProvider>
  );
}
