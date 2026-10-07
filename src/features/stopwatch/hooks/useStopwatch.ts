import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { fetchIssue, isIssueKey, type JiraIssue } from '@/api/jira-issues';
import { describeLogWorkError } from '@/api/useLogWorkMutation';
import { createWorklog } from '@/api/jira-worklogs';
import { useReportFiltersStore } from '@/features/team-reports/store/useReportFiltersStore';
import { buildNewWorklog } from '@/lib/worklogForm';
import {
  type StopwatchState,
  displaySeconds,
  emptyStopwatch,
  hasTrackedTime,
  pauseStopwatch,
  startStopwatch,
  worklogWindow,
} from '../lib/clock';
import { worklogDraftFromClock } from '../lib/draft';
import { revealReports } from '../lib/revealReports';
import { freshStopwatch, loadStopwatch, saveStopwatch } from '../lib/storage';

function initialStopwatch(params: URLSearchParams): StopwatchState {
  const saved = loadStopwatch();
  if (saved && (hasTrackedTime(saved) || saved.issueKey)) return saved;

  const issueKey = params.get('issue') ?? '';
  const issueSummary = params.get('summary') ?? '';
  if (!isIssueKey(issueKey)) return saved ?? emptyStopwatch();

  const description = saved?.issueKey === issueKey ? saved.description : '';
  return freshStopwatch(issueKey, issueSummary, description);
}

export function useStopwatch() {
  const [params] = useSearchParams();
  const timeZone = useReportFiltersStore((state) => state.display.timeZone);
  const [state, setState] = useState<StopwatchState>(() => initialStopwatch(params));
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    saveStopwatch(state);
  }, [state]);

  useEffect(() => {
    if (!state.isRunning) return;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 200);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [state.isRunning]);

  const seconds = displaySeconds(state, now);
  const canTrack = isIssueKey(state.issueKey);

  function toggle() {
    if (!canTrack || isSaving) return;
    setNotice(null);
    setState((current) => (current.isRunning ? pauseStopwatch(current) : startStopwatch(current)));
  }

  function setDescription(description: string) {
    setNotice(null);
    setState((current) => ({ ...current, description }));
  }

  function reset() {
    if (isSaving) return;
    setNotice(null);
    setState((current) => ({
      ...current,
      startedAt: null,
      elapsedSeconds: 0,
      isRunning: false,
      stoppedAt: null,
    }));
  }

  function chooseIssue(issue: JiraIssue) {
    setNotice(null);
    setState((current) => {
      const next = {
        ...current,
        issueId: issue.id,
        issueKey: issue.key,
        issueSummary: issue.summary,
      };
      return hasTrackedTime(current) ? next : startStopwatch(next);
    });
  }

  async function launch() {
    if (isSaving || !canTrack) return;
    const started = Date.now();
    const times = worklogWindow(state, started);
    if (!times) return;

    const draft = worklogDraftFromClock({ ...times, description: state.description }, timeZone);
    if (!draft.ok) {
      setNotice({ tone: 'warning', text: draft.error });
      return;
    }
    const built = buildNewWorklog(draft.values, timeZone);
    if ('error' in built || !built.input) {
      setNotice({ tone: 'warning', text: 'error' in built ? built.error : 'Não foi possível preparar o lançamento.' });
      return;
    }

    setIsSaving(true);
    setNotice(null);
    setState((current) => pauseStopwatch(current, started));
    try {
      const issueId = state.issueId || (await fetchIssue(state.issueKey)).id;
      await createWorklog(issueId, built.input);
      setState(emptyStopwatch());
      await revealReports();
      window.close();
    } catch (error) {
      const failure = error instanceof Error ? error : new Error('Não foi possível lançar as horas.');
      setNotice({ tone: 'error', text: describeLogWorkError(failure) });
      setIsSaving(false);
    }
  }

  return {
    issueKey: state.issueKey,
    issueSummary: state.issueSummary,
    description: state.description,
    isRunning: state.isRunning,
    seconds,
    canTrack,
    isSaving,
    notice,
    toggle,
    reset,
    setDescription,
    chooseIssue,
    launch,
  };
}
