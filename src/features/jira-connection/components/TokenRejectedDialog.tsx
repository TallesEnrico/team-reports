import { ArrowSquareOut, Key } from '@phosphor-icons/react';
import { useId, useState } from 'react';
import { Button } from '../../../components/Button';
import { Modal } from '../../../components/Modal';
import { pendingJiraWriteNotice } from '@/api/pendingJiraWrite';
import { startAtlassianLogin } from '../lib/atlassianOAuth';
import { useJiraConnectionStore } from '../../../store/useJiraConnectionStore';
import styles from './TokenRejectedDialog.module.css';

const API_TOKENS_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens';

/**
 * Aviso de que o Jira não aceita mais o token conectado (expirou ou foi
 * revogado): sem ele nenhuma busca nem escrita funciona. Leva a conectar um
 * token novo para a mesma conta; "Agora não" fecha, e o rodapé da lateral continua avisando.
 */
export function TokenRejectedDialog({ notice }: { notice?: string | null }) {
  const titleId = useId();
  const email = useJiraConnectionStore((state) => state.credentials?.email);
  const oauth = useJiraConnectionStore((state) => state.credentials?.authMethod) === 'oauth';
  const dismissRejection = useJiraConnectionStore((state) => state.dismissRejection);
  const startReconnect = useJiraConnectionStore((state) => state.startReconnect);
  const [loginError, setLoginError] = useState<string | null>(null);
  const savedAction = pendingJiraWriteNotice();

  return (
    <Modal
      labelledBy={titleId}
      onClose={dismissRejection}
      header={
        <div className={styles.heading}>
          <span className={styles.icon} aria-hidden>
            <Key size={18} weight="bold" />
          </span>
          <h2 id={titleId} className={styles.title}>
            {oauth ? 'O acesso da Atlassian expirou' : 'O token do Jira parou de funcionar'}
          </h2>
        </div>
      }
    >
      <div className={styles.body}>
        {notice && <p>{notice}</p>}
        {savedAction && <p>{savedAction}</p>}
        {loginError && <p>{loginError}</p>}
        {oauth ? (
          <p>
            O acesso de <strong>{email}</strong> na Atlassian <strong>expirou</strong>. Não há sessão no servidor: entre de
            novo para o Team Reportss voltar a chamar o Jira. A squad e as preferências continuam neste navegador.
          </p>
        ) : (
          <>
            <p>
              O Jira não aceita mais o token de <strong>{email}</strong>: ele <strong>expirou</strong> (os tokens de API da
              Atlassian têm data de validade) ou foi <strong>revogado</strong> na página de tokens da conta.
            </p>
            <p>
          Enquanto isso, nenhuma tela consegue buscar ou salvar nada no Jira. Entre com a Atlassian para substituir esse
          token. A squad e as preferências continuam neste navegador.
        </p>
            <a className={styles.link} href={API_TOKENS_URL} target="_blank" rel="noopener noreferrer">
              <ArrowSquareOut size={15} weight="bold" aria-hidden />
              Ver os meus tokens na Atlassian
              <span className="sr-only"> (abre em nova aba)</span>
            </a>
          </>
        )}
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={oauth ? dismissRejection : startReconnect}>
          {oauth ? 'Agora não' : 'Usar um token de API'}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            setLoginError(null);
            void startAtlassianLogin().catch((cause: unknown) => {
              setLoginError(cause instanceof Error ? cause.message : 'Não foi possível iniciar o login com a Atlassian.');
            });
          }}
        >
          Entrar com Atlassian
        </Button>
      </div>
    </Modal>
  );
}
