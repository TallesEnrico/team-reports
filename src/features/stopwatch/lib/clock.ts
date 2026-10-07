export interface StopwatchState {
  issueId: string;
  issueKey: string;
  issueSummary: string;
  startedAt: number | null;
  elapsedSeconds: number;
  isRunning: boolean;
  description: string;
  stoppedAt: number | null;
}

export function emptyStopwatch(): StopwatchState {
  return {
    issueId: '',
    issueKey: '',
    issueSummary: '',
    startedAt: null,
    elapsedSeconds: 0,
    isRunning: false,
    description: '',
    stoppedAt: null,
  };
}

export function displaySeconds(state: StopwatchState, now = Date.now()): number {
  if (!state.isRunning || state.startedAt === null) return state.elapsedSeconds;
  return state.elapsedSeconds + Math.max(0, Math.floor((now - state.startedAt) / 1000));
}

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest].map((part) => String(part).padStart(2, '0')).join(':');
}

export function startStopwatch(state: StopwatchState, now = Date.now()): StopwatchState {
  if (state.isRunning) return state;
  return { ...state, startedAt: now, isRunning: true, stoppedAt: null };
}

export function pauseStopwatch(state: StopwatchState, now = Date.now()): StopwatchState {
  if (!state.isRunning) return state;
  return {
    ...state,
    elapsedSeconds: displaySeconds(state, now),
    startedAt: null,
    isRunning: false,
    stoppedAt: now,
  };
}

export function hasTrackedTime(state: StopwatchState): boolean {
  return state.isRunning || state.elapsedSeconds > 0;
}

export function worklogWindow(state: StopwatchState, now = Date.now()): { startedAt: number; endedAt: number; durationSeconds: number } | null {
  const durationSeconds = displaySeconds(state, now);
  if (durationSeconds <= 0) return null;
  const endedAt = state.isRunning ? now : (state.stoppedAt ?? now);
  return { startedAt: endedAt - durationSeconds * 1000, endedAt, durationSeconds };
}
