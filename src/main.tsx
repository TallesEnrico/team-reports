import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/newsreader';
import './styles/global.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { captureOAuthReturn } from './features/jira-connection/lib/atlassianOAuth';
import { App } from './App';
import { openLegacyShareLink } from './features/team-reports/lib/shareLink';

function promoteHashRoute(): void {
  const hash = window.location.hash;
  if (!hash.startsWith('#/')) return;
  if (window.location.pathname.startsWith('/cronometro')) {
    const url = new URL(window.location.href);
    url.hash = '';
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
    return;
  }
  const body = hash.slice(1);
  const queryAt = body.indexOf('?');
  const path = queryAt === -1 ? body : body.slice(0, queryAt);
  const search = queryAt === -1 ? '' : body.slice(queryAt);
  const pathname = path.startsWith('/') ? path : `/${path}`;
  window.history.replaceState(window.history.state, '', `${pathname}${search}`);
}

promoteHashRoute();
captureOAuthReturn();
openLegacyShareLink();

if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      const script = registration.active?.scriptURL ?? registration.waiting?.scriptURL ?? registration.installing?.scriptURL ?? '';
      if (script.endsWith('/stopwatch-sw.js')) void registration.unregister();
    }
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
