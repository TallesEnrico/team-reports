import { isIssueKey } from '@/api/jira-issues';
import { type StopwatchState, emptyStopwatch } from './clock';

const STORAGE_KEY = 'team-stopwatch';
const MAX_SUMMARY = 500;
const MAX_DESCRIPTION = 10_000;
const MAX_ELAPSED = 30 * 24 * 60 * 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStopwatchState(value: unknown): value is StopwatchState {
  if (!isRecord(value)) return false;
  if (value.issueKey !== '' && !isIssueKey(typeof value.issueKey === 'string' ? value.issueKey : null)) return false;
  if (typeof value.issueKey !== 'string') return false;
  if (value.issueId !== undefined && typeof value.issueId !== 'string') return false;
  if (typeof value.issueSummary !== 'string' || value.issueSummary.length > MAX_SUMMARY) return false;
  if (value.startedAt !== null && (typeof value.startedAt !== 'number' || !Number.isFinite(value.startedAt))) return false;
  if (typeof value.elapsedSeconds !== 'number' || !Number.isInteger(value.elapsedSeconds)) return false;
  if (value.elapsedSeconds < 0 || value.elapsedSeconds > MAX_ELAPSED) return false;
  if (typeof value.isRunning !== 'boolean') return false;
  if (value.isRunning && typeof value.startedAt !== 'number') return false;
  if (typeof value.description !== 'string' || value.description.length > MAX_DESCRIPTION) return false;
  if (value.stoppedAt !== null && (typeof value.stoppedAt !== 'number' || !Number.isFinite(value.stoppedAt))) return false;
  return true;
}

export function loadStopwatch(): StopwatchState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isStopwatchState(parsed)) return null;
    return { ...parsed, issueId: typeof parsed.issueId === 'string' ? parsed.issueId : '' };
  } catch {
    return null;
  }
}

export function saveStopwatch(state: StopwatchState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    return;
  }
}

export function freshStopwatch(issueKey: string, issueSummary: string, description = ''): StopwatchState {
  if (!isIssueKey(issueKey)) return emptyStopwatch();
  return {
    issueId: '',
    issueKey,
    issueSummary: issueSummary.slice(0, MAX_SUMMARY),
    startedAt: Date.now(),
    elapsedSeconds: 0,
    isRunning: true,
    description: description.slice(0, MAX_DESCRIPTION),
    stoppedAt: null,
  };
}
