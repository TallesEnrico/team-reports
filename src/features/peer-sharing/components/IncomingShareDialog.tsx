import { SealCheck, ShareNetwork } from '@phosphor-icons/react';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { Modal } from '../../../components/Modal';
import { Notice } from '../../../components/Notice';
import { useReportFiltersStore } from '../../team-reports/store/useReportFiltersStore';
import { saveSharedDashboard } from '../lib/saveSharedDashboard';
import { type IncomingShare, usePeerStore } from '../store/usePeerStore';
import styles from './IncomingShareDialog.module.css';
import { SharedDashboardSummary } from './SharedDashboardSummary';
import { SharedReportSummary } from './SharedReportSummary';

interface IncomingShareDialogProps {
  share: IncomingShare;
  /** Outros envios esperando na fila, depois deste. */
  queued: number;
}

/**
 * Um dashboard ou relatório chegou de outro dispositivo, já validado: quem
 * recebe vê quem enviou e o que é, e aceita ou recusa. Aparece em qualquer tela.
 * Nome, foto e e-mail são os que o Jira da empresa mostra para a conta
 * (accountId) do dispositivo: a conta existe e está ativa, mas nada prova que o
 * dispositivo é mesmo dela.
 */
export function IncomingShareDialog({ share, queued }: IncomingShareDialogProps) {
  const titleId = useId();
  const navigate = useNavigate();
  const myAccountId = usePeerStore((state) => state.accountId);
  const respondIncoming = usePeerStore((state) => state.respondIncoming);
  const dismissIncoming = usePeerStore((state) => state.dismissIncoming);
  const blockSender = usePeerStore((state) => state.blockSender);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { account, profile } = share.from;
  const isReport = share.kind === 'report';
  const isPending = share.state === 'pending' && (share.kind === 'report' ? share.report !== null : share.dashboard !== null);

  async function accept() {
    if (share.kind === 'report') {
      if (!share.report) return;
      useReportFiltersStore.getState().applyShared(share.report);
      respondIncoming(share.key, { status: 'accepted' });
      navigate('/reports');
      return;
    }
    if (!share.dashboard) return;
    setIsSaving(true);
    setError(null);
    try {
      await saveSharedDashboard(share.dashboard);
    } catch {
      setIsSaving(false);
      setError('Não foi possível guardar o dashboard neste navegador. Tente de novo.');
      return;
    }
    respondIncoming(share.key, { status: 'accepted' });
    navigate('/dashboard');
  }

  // Fechar (botão, Esc) um pedido que espera resposta é recusar.
  function close() {
    if (isPending) respondIncoming(share.key, { status: 'declined' });
    else dismissIncoming(share.key);
  }

  return (
    <Modal
      labelledBy={titleId}
      onClose={close}
      isCloseDisabled={isSaving}
      closeOnBackdrop={false}
      header={
        <div className={styles.heading}>
          <span className={styles.icon} aria-hidden>
            <ShareNetwork size={18} weight="bold" />
          </span>
          <h2 id={titleId} className={styles.title}>
            {isReport ? 'Relatório recebido' : 'Dashboard recebido'}
          </h2>
        </div>
      }
    >
      <div className={styles.sender}>
        <Avatar src={account.avatarUrl ?? undefined} name={account.name} size={32} />
        <span className={styles.senderText}>
          <span className={styles.senderName}>{account.name}</span>
          <span className={styles.senderMeta}>{account.email ? `${account.email} · ${profile.deviceName}` : profile.deviceName}</span>
          <span className={styles.verified}>
            <SealCheck size={13} weight="bold" aria-hidden />
            {account.accountId === myAccountId ? 'A mesma conta do Jira que a sua' : 'Conta ativa no Jira da empresa'}
          </span>
        </span>
      </div>

      {share.state === 'pending' && share.kind === 'dashboard' && share.dashboard && (
        <>
          <p className={styles.text}>Quer te enviar este dashboard:</p>
          <SharedDashboardSummary
            name={share.dashboard.name}
            blocks={share.blocks}
            sources={share.sources}
            period={share.period}
            skipped={share.dashboard.skipped}
          />
        </>
      )}
      {share.state === 'pending' && share.kind === 'report' && share.report && (
        <>
          <p className={styles.text}>Quer te enviar este relatório:</p>
          <SharedReportSummary report={share.report} />
        </>
      )}
      {share.state === 'cancelled' && <Notice tone="warning">O envio foi cancelado por quem enviou. Nada foi salvo.</Notice>}
      {share.state === 'expired' && (
        <Notice tone="warning">
          O tempo para responder acabou e nada foi salvo. Se ainda quiser {isReport ? 'o relatório' : 'o dashboard'}, peça para enviar
          de novo.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {queued > 0 && (
        <p className={styles.queue}>
          Mais {queued} {queued === 1 ? 'envio esperando' : 'envios esperando'} depois deste.
        </p>
      )}

      <div className={styles.actions}>
        <Button
          variant="ghost"
          className={styles.stop}
          disabled={isSaving}
          title="Recusa este envio e impede esta pessoa de enviar de novo. Dá para liberar em Configurações."
          onClick={() => blockSender(share.key)}
        >
          Bloquear usuário
        </Button>
        {isPending ? (
          <>
            <Button
              variant="secondary"
              disabled={isSaving}
              title="Recusa só este envio. A pessoa pode enviar de novo."
              onClick={close}
            >
              Recusar
            </Button>
            <Button variant="primary" disabled={isSaving} onClick={() => void accept()}>
              {isSaving ? 'Abrindo…' : 'Aceitar e abrir'}
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={close}>
            Fechar
          </Button>
        )}
      </div>
    </Modal>
  );
}
