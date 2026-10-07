import { LogWorkDialog } from './LogWorkDialog';
import { useReportFiltersStore } from '../store/useReportFiltersStore';
import { useLogWorkDialogStore } from '../store/useLogWorkDialogStore';

export function LogWorkDialogHost() {
  const session = useLogWorkDialogStore((state) => state.session);
  const close = useLogWorkDialogStore((state) => state.close);
  const timeZone = useReportFiltersStore((state) => state.display.timeZone);
  if (!session) return null;

  return (
    <LogWorkDialog
      key={session.id}
      timeZone={timeZone}
      initialIssue={session.issue}
      initialDate={session.date}
      initialStart={session.start}
      initialEnd={session.end}
      initialComment={session.comment}
      onClose={close}
    />
  );
}
