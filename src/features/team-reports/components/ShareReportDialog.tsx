import { Export, LinkSimple } from '@phosphor-icons/react';
import { useId, useMemo, useState } from 'react';
import { useCurrentUserQuery } from '../../../api/useCurrentUserQuery';
import { Button } from '../../../components/Button';
import { Modal } from '../../../components/Modal';
import { Notice } from '../../../components/Notice';
import { useCopyToClipboard } from '../../../hooks/useCopyToClipboard';
import { PeerSharePanel } from '../../peer-sharing/components/PeerSharePanel';
import { REPORT_SHARE_ITEM, usePeerStore } from '../../peer-sharing/store/usePeerStore';
import { buildShareSearch, buildShareUrl, filtersForShare } from '../lib/shareLink';
import { useReportFiltersStore } from '../store/useReportFiltersStore';
import styles from './ShareReportDialog.module.css';

export function ShareReportDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const draft = useReportFiltersStore((state) => state.draft);
  const display = useReportFiltersStore((state) => state.display);
  const currentUser = useCurrentUserQuery();
  const shareReport = usePeerStore((state) => state.shareReport);
  const me = currentUser.data;
  const filters = useMemo(
    () => filtersForShare(draft, me ? { accountId: me.accountId, displayName: me.displayName } : null),
    [draft, me],
  );
  const search = useMemo(() => buildShareSearch(filters, display), [filters, display]);
  const link = useMemo(() => buildShareUrl(filters, display), [filters, display]);
  const [shareError, setShareError] = useState<string | null>(null);
  const { copy, copied } = useCopyToClipboard();
  const canShare = typeof navigator.share === 'function';

  async function shareLink() {
    setShareError(null);
    try {
      await navigator.share({
        title: 'Relatório de horas',
        text: 'Relatório de horas do Team Reports. Abra o link para ver o mesmo recorte.',
        url: link,
      });
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') {
        setShareError('O compartilhar do navegador não abriu. Copie o link e envie por onde quiser.');
      }
    }
  }

  async function copyLink() {
    setShareError(null);
    if (!(await copy(link))) window.prompt('Copie o link dos filtros:', link);
  }

  return (
    <Modal
      labelledBy={titleId}
      onClose={onClose}
      header={
        <h2 id={titleId} className={styles.title}>
          Compartilhar relatório
        </h2>
      }
    >
      <p className={styles.lead}>
        Vai o recorte: datas, projetos, pessoas, JQL e a configuração. As horas, não: quem recebe vê o que a conta dele enxerga no Jira.
      </p>

      <section className={styles.section} aria-labelledby={`${titleId}-browser`}>
        <div className={styles.sectionHead}>
          <h3 id={`${titleId}-browser`} className={styles.sectionTitle}>
            Pelo navegador
          </h3>
          <p className={styles.sectionText}>Um link com os filtros atuais, para mandar por onde quiser. Quem abre no Team Reports vê o mesmo recorte.</p>
        </div>
        <div className={styles.actions}>
          {canShare && (
            <Button variant="primary" icon={<Export size={15} weight="bold" aria-hidden />} onClick={() => void shareLink()}>
              Compartilhar…
            </Button>
          )}
          <Button variant="secondary" icon={<LinkSimple size={15} weight="bold" aria-hidden />} onClick={() => void copyLink()}>
            {copied ? 'Link copiado' : 'Copiar link'}
          </Button>
        </div>
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
        <PeerSharePanel itemId={REPORT_SHARE_ITEM} onSend={(device) => void shareReport(device, search)} />
      </section>
    </Modal>
  );
}
