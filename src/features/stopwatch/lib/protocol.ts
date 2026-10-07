export const STOPWATCH_CHANNEL = 'team-stopwatch';

export type StopwatchMessage = { type: 'GO_REPORTS' } | { type: 'REPORTS_OPENED' };

let channel: BroadcastChannel | null = null;

export function stopwatchChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel !== 'function') return null;
  channel ??= new BroadcastChannel(STOPWATCH_CHANNEL);
  return channel;
}

export function postStopwatch(message: StopwatchMessage): void {
  stopwatchChannel()?.postMessage(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readStopwatchMessage(data: unknown): StopwatchMessage | null {
  if (!isRecord(data)) return null;
  if (data.type === 'GO_REPORTS' || data.type === 'REPORTS_OPENED') return { type: data.type };
  return null;
}
