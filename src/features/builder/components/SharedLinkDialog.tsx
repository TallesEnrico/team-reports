import { LinkSimple } from '@phosphor-icons/react';
import { useId } from 'react';
import { Button } from '../../../components/Button';
import { Modal } from '../../../components/Modal';
import { Notice } from '../../../components/Notice';
import { SharedDashboardSummary } from '../../peer-sharing/components/SharedDashboardSummary';
import type { SharedLinkResult } from '../hooks/useSharedDashboardLink';
import { periodLabel } from '../lib/periods';
import { blockCount, sourceCount } from '../lib/transfer';
import { useBuilderStore } from '../store/useBuilderStore';
import styles from './SharedLinkDialog.module.css';

/** Um link compartilhado foi aberto: o dashboard dele (já validado) e a confirmação antes de importar. */
export function SharedLinkDialog({ result, onClose }: { result: SharedLinkResult; onClose: () => void }) {
  const titleId = useId();
  const importDashboard = useBuilderStore((state) => state.importDashboard);
  const setMode = useBuilderStore((state) => state.setMode);

  return (
    <Modal
      labelledBy={titleId}
      onClose={onClose}
      closeOnBackdrop={false}
      header={
        <div className={styles.heading}>
          <span className={styles.icon} aria-hidden>
            <LinkSimple size={18} weight="bold" />
          </span>
          <h2 id={titleId} className={styles.title}>
            {result.ok ? 'Importar o dashboard do link?' : 'Dashboard do link'}
          </h2>
        </div>
      }
    >
      {result.ok ? (
        <>
          <SharedDashboardSummary
            name={result.dashboard.name}
            blocks={blockCount(result.dashboard)}
            sources={sourceCount(result.dashboard)}
            period={periodLabel(result.dashboard.period)}
            skipped={result.dashboard.skipped}
          />
          <div className={styles.actions}>
            <Button variant="secondary" onClick={onClose}>
              Agora não
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                importDashboard(result.dashboard);
                setMode('view');
                onClose();
              }}
            >
              Importar e abrir
            </Button>
          </div>
        </>
      ) : (
        <>
          <Notice tone="error">Não foi possível abrir o dashboard do link: {result.error}</Notice>
          <div className={styles.actions}>
            <Button variant="primary" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
