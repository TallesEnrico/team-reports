import { Key, UserCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { pendingJiraWriteNotice } from '@/api/pendingJiraWrite';
import { useCurrentUserQuery } from '../../../api/useCurrentUserQuery';
import { Button } from '../../../components/Button';
import { SignOutButton } from '../../../components/SignOutButton';
import { cx } from '../../../lib/cx';
import { useJiraConnectionStore } from '../../../store/useJiraConnectionStore';
import { startAtlassianLogin } from '../lib/atlassianOAuth';
import { usePeerStore } from '../../peer-sharing/store/usePeerStore';
import styles from './ConnectionStatus.module.css';

/** Conta conectada e a saída para trocar de conta (ex: token expirado). */
export function ConnectionStatus() {
  const credentials = useJiraConnectionStore((state) => state.credentials);
  const tokenRejected = useJiraConnectionStore((state) => state.tokenRejected);
  const oauth = credentials?.authMethod === 'oauth';
  // Foto da conta no Jira; sem ela (carregando ou com erro), aparece o ícone genérico.
  const avatarUrl = useCurrentUserQuery().data?.avatarUrl;
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const savedAction = tokenRejected ? pendingJiraWriteNotice() : null;
  const online = usePeerStore((state) => state.status) === 'online';
  const presenceLabel = online ? 'Conectado' : 'Desconectado';

  if (!credentials) return null;

  return (
    <div className={styles.status}>
      {/* O token não vale mais: o aviso fica aqui mesmo depois de fechar o modal. */}
      {tokenRejected && (
        <div className={styles.alert} role="alert">
          <p className={styles.alertText}>
            <Key size={15} weight="bold" aria-hidden />
            <span>
              <strong>{oauth ? 'Acesso da Atlassian expirado.' : 'Token recusado pelo Jira.'}</strong>{' '}
              {savedAction
                ? 'A alteração ficou salva e será concluída ao entrar.'
                : oauth
                  ? 'Entre de novo para continuar.'
                  : 'Ele expirou ou foi revogado.'}
            </span>
          </p>
          <Button
            variant="primary"
            className={styles.reconnect}
            onClick={() => {
              setLoginError(null);
              void startAtlassianLogin().catch((cause: unknown) => {
                setLoginError(cause instanceof Error ? cause.message : 'Não foi possível iniciar o login com a Atlassian.');
              });
            }}
          >
            Entrar com Atlassian
          </Button>
          {loginError && <p className={styles.alertText}>{loginError}</p>}
        </div>
      )}
      <span className={styles.avatarWrap}>
        {avatarUrl && avatarUrl !== failedAvatarUrl ? (
          <img
            className={styles.avatar}
            src={avatarUrl}
            alt=""
            width={24}
            height={24}
            referrerPolicy="no-referrer"
            onError={() => setFailedAvatarUrl(avatarUrl)}
          />
        ) : (
          <UserCircle size={24} weight="bold" className={styles.icon} aria-hidden />
        )}
        <span className={cx(styles.presence, online && styles.online)} role="img" aria-label={presenceLabel} title={presenceLabel} />
      </span>
      <div className={styles.info}>
        <span className={styles.email} title={credentials.email}>
          {credentials.email}
        </span>
      </div>
      <SignOutButton />
    </div>
  );
}
