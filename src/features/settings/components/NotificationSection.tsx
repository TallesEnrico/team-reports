import { useId } from 'react';
import { Button } from '@/components/Button';
import { canPlayNotificationSound, playNotificationSound } from '@/lib/notificationSound';
import { usePeerStore } from '@/features/peer-sharing/store/usePeerStore';
import styles from './NotificationSection.module.css';
import sectionStyles from './Section.module.css';

/** "Notificações": o som de quando chega um dashboard ou relatório de outro dispositivo. */
export function NotificationSection() {
  const headingId = useId();
  const soundEnabled = usePeerStore((state) => state.soundEnabled);
  const setSoundEnabled = usePeerStore((state) => state.setSoundEnabled);

  return (
    <section className={sectionStyles.section} aria-labelledby={headingId}>
      <div className={sectionStyles.head}>
        <h2 id={headingId} className={sectionStyles.heading}>
          Notificações
        </h2>
        <p className={sectionStyles.description}>
          Quando alguém compartilha um dashboard ou relatório com você, o título da aba mostra quantos envios esperam
          resposta e pisca se a aba estiver em segundo plano.
        </p>
      </div>
      <div className={sectionStyles.card}>
        {canPlayNotificationSound ? (
          <div className={styles.row}>
            <label className={styles.toggle}>
              <input type="checkbox" checked={soundEnabled} onChange={(event) => setSoundEnabled(event.target.checked)} />
              <span>Tocar um som ao receber um compartilhamento</span>
            </label>
            <Button variant="secondary" onClick={() => playNotificationSound({ shared: false })}>
              Testar som
            </Button>
          </div>
        ) : (
          <p className={styles.note}>Este navegador não consegue tocar o som de aviso.</p>
        )}
      </div>
    </section>
  );
}
