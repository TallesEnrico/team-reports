const WINDOW_NAME = 'team-stopwatch';
const FEATURES = 'width=360,height=640,resizable=yes';

let stopwatchWindow: Window | null = null;

function isOpen(target: Window | null): target is Window {
  return target !== null && !target.closed;
}

export function openStopwatch(): void {
  if (isOpen(stopwatchWindow)) {
    stopwatchWindow.focus();
    return;
  }

  const url = new URL('/cronometro/index.html', window.location.origin);
  url.searchParams.set('janela', '1');
  stopwatchWindow = window.open(url.toString(), WINDOW_NAME, FEATURES);
}
