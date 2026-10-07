import { postStopwatch, readStopwatchMessage, stopwatchChannel } from './protocol';

function focusOpener(): boolean {
  const opener = window.opener as Window | null;
  if (!opener || opener.closed) return false;
  try {
    if (opener.location.pathname !== '/reports') opener.location.assign(`${opener.location.origin}/reports`);
    opener.focus();
    return true;
  } catch {
    return false;
  }
}

export function revealReports(): Promise<void> {
  postStopwatch({ type: 'GO_REPORTS' });
  if (focusOpener()) return Promise.resolve();

  return new Promise((resolve) => {
    const channel = stopwatchChannel();
    const finish = (acknowledged: boolean) => {
      channel?.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      if (!acknowledged) {
        window.open(`${window.location.origin}/reports`);
      }
      resolve();
    };
    const onMessage = (event: MessageEvent) => {
      const message = readStopwatchMessage(event.data);
      if (message?.type === 'REPORTS_OPENED') finish(true);
    };
    channel?.addEventListener('message', onMessage);
    const timer = window.setTimeout(() => finish(false), 300);
  });
}
