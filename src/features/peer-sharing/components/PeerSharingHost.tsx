import { usePeerConnection } from '../hooks/usePeerConnection';
import { useIncomingShareNotification } from '../hooks/useIncomingShareNotification';
import { usePeerStore } from '../store/usePeerStore';
import { IncomingShareDialog } from './IncomingShareDialog';

/**
 * As conexões entre dispositivos, em todas as telas: mantém este navegador na
 * sala e mostra, um de cada vez, os dashboards e relatórios que chegam.
 */
export function PeerSharingHost({ email }: { email: string }) {
  usePeerConnection(email);
  useIncomingShareNotification();
  const current = usePeerStore((state) => state.incoming[0]);
  const queued = usePeerStore((state) => Math.max(0, state.incoming.length - 1));
  if (!current) return null;
  // `nokey`: no Dashboard, Backspace num botão do diálogo não apaga a peça selecionada.
  return (
    <div className="nokey">
      <IncomingShareDialog key={current.key} share={current} queued={queued} />
    </div>
  );
}
