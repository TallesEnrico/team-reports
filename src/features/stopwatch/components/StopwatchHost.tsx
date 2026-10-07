import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { jiraKeys } from '@/api/queryKeys';
import { postStopwatch, readStopwatchMessage, stopwatchChannel } from '../lib/protocol';

export function StopwatchHost() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = stopwatchChannel();
    if (!channel) return;

    const onMessage = (event: MessageEvent) => {
      const message = readStopwatchMessage(event.data);
      if (!message || message.type !== 'GO_REPORTS') return;
      window.focus();
      navigate('/reports');
      void queryClient.invalidateQueries({ queryKey: jiraKeys.worklogReports() });
      void queryClient.invalidateQueries({ queryKey: jiraKeys.issueLists() });
      postStopwatch({ type: 'REPORTS_OPENED' });
    };

    channel.addEventListener('message', onMessage);
    return () => channel.removeEventListener('message', onMessage);
  }, [navigate, queryClient]);

  return null;
}
