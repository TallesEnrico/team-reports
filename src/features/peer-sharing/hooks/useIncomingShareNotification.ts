import { useEffect, useRef, useState } from 'react';
import { setTitleAlert, setTitleBadge } from '@/lib/documentTitle';
import { playNotificationSound } from '@/lib/notificationSound';
import { usePeerStore } from '../store/usePeerStore';

const BLINK_MS = 1200;

function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return hidden;
}

/**
 * Avisa que chegou um envio: "(N)" no título da aba enquanto houver envios
 * esperando resposta, o título pisca com a aba em segundo plano e, se ligado
 * em Configurações, toca um som a cada envio novo.
 */
export function useIncomingShareNotification() {
  const pendingKeys = usePeerStore((state) =>
    state.incoming
      .filter((share) => share.state === 'pending')
      .map((share) => share.key)
      .join('|'),
  );
  const soundEnabled = usePeerStore((state) => state.soundEnabled);
  const hidden = useDocumentHidden();
  const seen = useRef(new Set<string>());
  const count = pendingKeys ? pendingKeys.split('|').length : 0;

  useEffect(() => {
    const keys = pendingKeys ? pendingKeys.split('|') : [];
    const fresh = keys.filter((key) => !seen.current.has(key));
    seen.current = new Set(keys);
    if (fresh.length > 0 && soundEnabled) playNotificationSound();
  }, [pendingKeys, soundEnabled]);

  useEffect(() => {
    setTitleBadge(count);
  }, [count]);

  useEffect(() => {
    if (!hidden || count === 0) {
      setTitleAlert(null);
      return;
    }
    const text = count === 1 ? 'Novo compartilhamento' : `${count} novos compartilhamentos`;
    let on = true;
    setTitleAlert(text);
    const timer = window.setInterval(() => {
      on = !on;
      setTitleAlert(on ? text : null);
    }, BLINK_MS);
    return () => {
      window.clearInterval(timer);
      setTitleAlert(null);
    };
  }, [hidden, count]);

  useEffect(
    () => () => {
      setTitleBadge(0);
      setTitleAlert(null);
    },
    [],
  );
}
