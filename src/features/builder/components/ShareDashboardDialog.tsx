import { DownloadSimple, Export, LinkSimple } from '@phosphor-icons/react';
import { useEffect, useId, useMemo, useState } from 'react';
import { Button } from '../../../components/Button';
import { Modal } from '../../../components/Modal';
import { Notice } from '../../../components/Notice';
import { useCopyToClipboard } from '../../../hooks/useCopyToClipboard';
import { PeerSharePanel } from '../../peer-sharing/components/PeerSharePanel';
import { usePeerStore } from '../../peer-sharing/store/usePeerStore';
import { dashboardLink, MAX_LINK_LENGTH } from '../lib/dashboardLink';
import { serializeDashboard } from '../lib/transfer';
import type { Dashboard } from '../types';
import { useBuilderContext } from './BuilderContext';
import styles from './ShareDashboardDialog.module.css';

/** O endereço do app, sem o `#` (o app pode estar numa subpasta). */
function appUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

/**
 * "Compartilhar" (opções de cada dashboard): um link, pelo compartilhar do
 * navegador ou copiado, e o envio direto para um dispositivo conectado (os seus
 * ou de outras pessoas no mesmo Jira), que aceita ou recusa.
 */
export function ShareDashboardDialog({ dashboard, onClose }: { dashboard: Dashboard; onClose: () => void }) {
  const titleId = useId();
  const { exportDashboard } = useBuilderContext();
  const shareDashboard = usePeerStore((state) => state.shareDashboard);
  const file = useMemo(() => serializeDashboard(dashboard, { compact: true }), [dashboard]);
  const [link, setLink] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const { copy, copied } = useCopyToClipboard();
  const canShare = typeof navigator.share === 'function';
  const isTooLong = link !== null && link.length > MAX_LINK_LENGTH;

  useEffect(() => {
    let isCurrent = true;
    dashboardLink(dashboard, appUrl())
      .then((value) => isCurrent && setLink(value))
      .catch(() => isCurrent && setShareError('Não foi possível montar o link. Use “Baixar .json” e envie o arquivo.'));
    return () => {
      isCurrent = false;
    };
  }, [dashboard]);

  async function shareLink() {
    if (!link) return;
    setShareError(null);
    try {
      await navigator.share({
        title: `Dashboard “${dashboard.name}”`,
        text: `Dashboard “${dashboard.name}” do Dashboard. Abra o link para importar.`,
        url: link,
      });
    } catch (error) {
      // Fechar o compartilhar do sistema sem escolher nada não é erro.
      if ((error as DOMException).name !== 'AbortError') {
        setShareError('O compartilhar do navegador não abriu. Copie o link e envie por onde quiser.');
      }
    }
  }

  async function copyLink() {
    if (!link) return;
    setShareError(null);
    if (!(await copy(link))) setShareError('O navegador não deixou copiar. Tente de novo ou use o compartilhar.');
  }

  return (
    <Modal
      labelledBy={titleId}
      onClose={onClose}
      header={
        <h2 id={titleId} className={styles.title}>
          Compartilhar "{dashboard.name}"
        </h2>
      }
    >
      <p className={styles.lead}>
        Vai a montagem: peças, ligações, período e as escolhas de cada peça (squads, pessoas, JQL). Os números e as issues, não:
        quem recebe vê o que a conta dele enxerga no Jira.
      </p>

      <section className={styles.section} aria-labelledby={`${titleId}-browser`}>
        <div className={styles.sectionHead}>
          <h3 id={`${titleId}-browser`} className={styles.sectionTitle}>
            Pelo navegador
          </h3>
          <p className={styles.sectionText}>
            Um link com o dashboard, para mandar por onde quiser. Quem abre no Team Reports vê o que é e confirma antes de importar.
          </p>
        </div>
        {isTooLong ? (
          <Notice tone="warning">Este dashboard é grande demais para um link. Baixe o arquivo e envie; quem recebe usa “Importar”.</Notice>
        ) : (
          <div className={styles.actions}>
            {canShare && (
              <Button
                variant="primary"
                icon={<Export size={15} weight="bold" aria-hidden />}
                disabled={!link}
                onClick={() => void shareLink()}
              >
                Compartilhar…
              </Button>
            )}
            <Button
              variant="secondary"
              icon={<LinkSimple size={15} weight="bold" aria-hidden />}
              disabled={!link}
              onClick={() => void copyLink()}
            >
              {copied ? 'Link copiado' : 'Copiar link'}
            </Button>
          </div>
        )}
        {(isTooLong || shareError) && (
          <div className={styles.actions}>
            <Button
              variant="secondary"
              icon={<DownloadSimple size={15} weight="bold" aria-hidden />}
              onClick={() => exportDashboard(dashboard)}
            >
              Baixar .json
            </Button>
          </div>
        )}
        {shareError && <Notice tone="error">{shareError}</Notice>}
      </section>

      <section className={styles.section} aria-labelledby={`${titleId}-peers`}>
        <div className={styles.sectionHead}>
          <h3 id={`${titleId}-peers`} className={styles.sectionTitle}>
            Pelas conexões
          </h3>
          <p className={styles.sectionText}>
            Direto para outro navegador com o Team Reports aberto no mesmo Jira: os seus outros dispositivos ou outras pessoas,
            com qualquer e-mail. Quem recebe aceita ou recusa.
          </p>
        </div>
        <PeerSharePanel itemId={dashboard.id} onSend={(device) => void shareDashboard(dashboard.id, device, file)} />
      </section>
    </Modal>
  );
}
