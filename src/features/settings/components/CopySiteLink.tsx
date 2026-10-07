import { Check, Copy } from '@phosphor-icons/react';
import { useId, useState } from 'react';
import { Button } from '@/components/Button';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useJiraConnectionStore } from '@/store/useJiraConnectionStore';
import { formatSiteShare } from '@/features/jira-connection/lib/siteShare';
import sectionStyles from './Section.module.css';
import styles from './SettingsPage.module.css';

export function CopySiteLink() {
  const headingId = useId();
  const jsonHeadingId = useId();
  const domain = useJiraConnectionStore((state) => state.credentials?.domain) ?? '';
  const clientId = useJiraConnectionStore((state) => state.credentials?.cloudId) ?? '';
  const linkCopy = useCopyToClipboard();
  const jsonCopy = useCopyToClipboard();
  const [linkFailed, setLinkFailed] = useState(false);
  const [jsonFailed, setJsonFailed] = useState(false);
  const link = domain ? `${window.location.origin}/?dominio=${encodeURIComponent(domain)}` : '';
  const siteJson = domain && clientId ? formatSiteShare(domain, clientId) : '';

  return (
    <>
    <section className={sectionStyles.section} aria-labelledby={headingId}>
      <div className={sectionStyles.head}>
        <h2 id={headingId} className={sectionStyles.heading}>
          Link do site
        </h2>
        <p className={sectionStyles.description}>
          Copia o endereço deste app já com o domínio do Jira da conta. Quem abre o link cai no assistente com o site
          preenchido.
        </p>
      </div>
      <div className={sectionStyles.card}>
        {domain ? (
          <>
            <div className={styles.siteLink}>
              <Button
                variant="secondary"
                icon={
                  linkCopy.copied ? <Check size={14} weight="bold" aria-hidden /> : <Copy size={14} weight="bold" aria-hidden />
                }
                onClick={() => void linkCopy.copy(link).then((ok) => setLinkFailed(!ok))}
              >
                {linkCopy.copied ? 'Link copiado' : 'Copiar link do site'}
              </Button>
              <p className={styles.siteLinkHint}>
                O link leva o domínio <code>{domain}</code> (<code>?dominio=</code>).
              </p>
            </div>
            {linkFailed && <p className={styles.siteLinkFailed}>O navegador não deixou copiar. O link é {link}</p>}
          </>
        ) : (
          <p className={sectionStyles.cardText}>Conecte sua conta do Jira para copiar o link com o domínio do site.</p>
        )}
      </div>
    </section>
      <section className={sectionStyles.section} aria-labelledby={jsonHeadingId}>
        <div className={sectionStyles.head}>
          <h2 id={jsonHeadingId} className={sectionStyles.heading}>
            JSON do site
          </h2>
          <p className={sectionStyles.description}>
            Domínio e Cloud ID desta conta, sem e-mail e sem token. Quem recebe cola este JSON no primeiro passo do
            assistente: o domínio e o Cloud ID são preenchidos na hora.
          </p>
        </div>
        {siteJson ? (
          <figure className={sectionStyles.share}>
            <figcaption className={sectionStyles.shareBar}>
              <span>JSON do site</span>
              <Button
                variant="ghost"
                className={sectionStyles.shareAction}
                icon={
                  jsonCopy.copied ? <Check size={14} weight="bold" aria-hidden /> : <Copy size={14} weight="bold" aria-hidden />
                }
                onClick={() => void jsonCopy.copy(siteJson).then((ok) => setJsonFailed(!ok))}
              >
                {jsonCopy.copied ? 'Copiado' : 'Copiar'}
              </Button>
            </figcaption>
            <pre className={sectionStyles.shareCode}>
              <code>{siteJson}</code>
            </pre>
            {jsonFailed && (
              <p className={sectionStyles.shareFailed}>O navegador não deixou copiar: selecione o texto e copie.</p>
            )}
          </figure>
        ) : (
          <div className={sectionStyles.card}>
            <p className={sectionStyles.cardText}>Conecte sua conta do Jira para copiar o JSON do site.</p>
          </div>
        )}
      </section>
    </>
  );
}
