import { useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { resumePendingJiraWrites, type ResumeResult } from '@/api/jira-client';
import { BuilderPageFallback } from './features/builder/components/BuilderPageFallback';
import { HomePage } from './features/home/components/HomePage';
import { ConnectionWizard } from './features/jira-connection/components/ConnectionWizard';
import { acceptAtlassianLogin, captureOAuthReturn, oauthErrorMessage } from './features/jira-connection/lib/atlassianOAuth';
import { watchAtlassianAccess } from './features/jira-connection/lib/refreshAtlassianAccess';
import { forgetSiteDomainHint } from './features/jira-connection/lib/siteHint';
import { ResumeNotice } from './features/jira-connection/components/ResumeNotice';
import { TokenRejectedDialog } from './features/jira-connection/components/TokenRejectedDialog';
import { KanbanPage } from './features/kanban/components/KanbanPage';
import { MetricsPage } from './features/metrics/components/MetricsPage';
import { PeerSharingHost } from './features/peer-sharing/components/PeerSharingHost';
import { PrivacyPage } from './features/privacy/components/PrivacyPage';
import { SettingsPage } from './features/settings/components/SettingsPage';
import { StopwatchHost } from './features/stopwatch/components/StopwatchHost';
import { StopwatchPage } from './features/stopwatch/components/StopwatchPage';
import { LogWorkDialogHost } from './features/team-reports/components/LogWorkDialogHost';
import { TeamReportPage } from './features/team-reports/components/TeamReportPage';
import { useReportFiltersHydrated, useReportFiltersStore } from './features/team-reports/store/useReportFiltersStore';
import { useJiraSiteFavicon } from './hooks/useJiraSiteFavicon';
import { useApplyTheme } from './hooks/useTheme';
import { type JiraCredentials, useJiraConnectionStore } from './store/useJiraConnectionStore';
import { useOpenRouterStore } from './store/useOpenRouterStore';

// O Dashboard fica fora do pacote inicial (o editor de peças, React Flow, é a maior parte dele)
// e é baixado em segundo plano quando o navegador fica ocioso: ao abrir a tela, já está pronto.
const loadBuilderPage = () => import('./features/builder/components/BuilderPage');
const BuilderPage = lazy(() => loadBuilderPage().then((module) => ({ default: module.BuilderPage })));

/** Roda `task` quando o navegador fica ocioso, sem disputar com a primeira tela. Devolve o cancelamento. */
function whenIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(task, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  // Safari não tem requestIdleCallback.
  const id = setTimeout(task, 1500);
  return () => clearTimeout(id);
}

export function App() {
  const filtersReady = useReportFiltersHydrated();
  const connectionStatus = useJiraConnectionStore((state) => state.status);
  const loadConnection = useJiraConnectionStore((state) => state.load);
  const credentials = useJiraConnectionStore((state) => state.credentials);
  const tokenRejected = useJiraConnectionStore((state) => state.tokenRejected);
  const rejectionDismissed = useJiraConnectionStore((state) => state.rejectionDismissed);
  const isReconnecting = useJiraConnectionStore((state) => state.isReconnecting);
  const cancelReconnect = useJiraConnectionStore((state) => state.cancelReconnect);
  const [oauthSettled, setOauthSettled] = useState(() => captureOAuthReturn() === null);
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);
  const [resumeNotice, setResumeNotice] = useState<ResumeResult | null>(null);
  const queryClient = useQueryClient();
  const setDraft = useReportFiltersStore((state) => state.setDraft);
  useApplyTheme();
  useJiraSiteFavicon();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadConnection();
      const returning = captureOAuthReturn();
      if (!returning) {
        if (!cancelled) setOauthSettled(true);
        return;
      }
      try {
        if (returning.kind === 'error') {
          if (!cancelled) setOauthNotice(oauthErrorMessage(returning.code));
          return;
        }
        await acceptAtlassianLogin(returning.sealed);
        if (cancelled) return;
        const saved = useJiraConnectionStore.getState().credentials;
        if (saved) {
          const { draft, applied } = useReportFiltersStore.getState();
          if (draft.projectKeys.length === 0 && applied === null) setDraft({ projectKeys: [saved.squad] });
          const resumed = await resumePendingJiraWrites();
          if (!cancelled && resumed) setResumeNotice(resumed);
        }
        void queryClient.resetQueries();
      } catch (cause) {
        if (!cancelled) {
          setOauthNotice(cause instanceof Error ? cause.message : 'Não foi possível concluir o login com a Atlassian.');
        }
      } finally {
        if (!cancelled) setOauthSettled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadConnection, queryClient, setDraft]);

  useEffect(() => {
    if (connectionStatus === 'connected') forgetSiteDomainHint();
  }, [connectionStatus]);

  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    return watchAtlassianAccess();
  }, [connectionStatus, credentials?.expiresAt, credentials?.refreshToken]);

  // A chave da OpenRouter (a IA do Dashboard), também cifrada no IndexedDB.
  const loadOpenRouter = useOpenRouterStore((state) => state.load);
  useEffect(() => {
    void loadOpenRouter();
  }, [loadOpenRouter]);

  // Um erro aqui é ignorado: ao abrir a tela, o `lazy` pede o módulo de novo.
  useEffect(() => whenIdle(() => void loadBuilderPage().catch(() => undefined)), []);

  // A squad escolhida vira o projeto dos filtros, a menos que já haja projetos
  // salvos ou um relatório em andamento (ex: link compartilhado, mesmo com
  // "todos os projetos").
  function handleConnected(credentials: JiraCredentials) {
    const { draft, applied } = useReportFiltersStore.getState();
    if (draft.projectKeys.length === 0 && applied === null) {
      setDraft({ projectKeys: [credentials.squad] });
    }
    void resumePendingJiraWrites().then((resumed) => {
      if (!resumed) return;
      setResumeNotice(resumed);
      void queryClient.invalidateQueries();
    });
  }

  // Token novo para a mesma conta: tudo que falhou com o token anterior é buscado de novo.
  function handleReconnected() {
    void resumePendingJiraWrites().then((resumed) => {
      if (resumed) setResumeNotice(resumed);
      void queryClient.resetQueries();
    });
  }

  // Espera o IndexedDB (filtros e conta, poucos ms) para a tela não montar com
  // os padrões e trocá-los em seguida.
  if (!filtersReady || connectionStatus === 'loading' || !oauthSettled) return null;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/reports" element={<TeamReportPage />} />
        <Route path="/kanban" element={<KanbanPage />} />
        <Route path="/metrics" element={<MetricsPage />} />
        <Route
          path="/dashboard"
          element={
            <Suspense fallback={<BuilderPageFallback />}>
              <BuilderPage />
            </Suspense>
          }
        />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/stopwatch" element={<StopwatchPage />} />
        <Route path="/cronometro/*" element={<StopwatchPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <MainWindowExtras
        disconnected={connectionStatus === 'disconnected'}
        notice={oauthNotice}
        onConnected={handleConnected}
        tokenRejected={connectionStatus === 'connected' && tokenRejected && !rejectionDismissed && !isReconnecting}
        peer={connectionStatus === 'connected' && credentials ? credentials.email : null}
        reconnect={
          connectionStatus === 'connected' && isReconnecting && credentials
            ? { email: credentials.email, squad: credentials.squad, cloudId: credentials.cloudId, domain: credentials.domain }
            : null
        }
        onReconnected={handleReconnected}
        onCancelReconnect={cancelReconnect}
        resumeNotice={resumeNotice}
        onCloseResume={() => setResumeNotice(null)}
      />
    </BrowserRouter>
  );
}

function MainWindowExtras({
  disconnected,
  notice,
  onConnected,
  tokenRejected,
  peer,
  reconnect,
  onReconnected,
  onCancelReconnect,
  resumeNotice,
  onCloseResume,
}: {
  disconnected: boolean;
  notice: string | null;
  onConnected: (credentials: JiraCredentials) => void;
  tokenRejected: boolean;
  peer: string | null;
  reconnect: { email: string; squad: string; cloudId: string; domain: string } | null;
  onReconnected: () => void;
  onCancelReconnect: () => void;
  resumeNotice: ResumeResult | null;
  onCloseResume: () => void;
}) {
  const { pathname } = useLocation();
  if (pathname === '/stopwatch' || pathname.startsWith('/cronometro') || pathname === '/privacy') return null;

  return (
    <>
      {disconnected && <ConnectionWizard notice={notice} onConnected={onConnected} />}
      {tokenRejected && <TokenRejectedDialog notice={notice} />}
      {resumeNotice && <ResumeNotice tone={resumeNotice.tone} message={resumeNotice.message} onClose={onCloseResume} />}
      {peer && <PeerSharingHost email={peer} />}
      {reconnect && (
        <ConnectionWizard reconnect={reconnect} onConnected={onReconnected} onCancel={onCancelReconnect} />
      )}
      <StopwatchHost />
      <LogWorkDialogHost />
    </>
  );
}
