import { ArrowSquareOut, Check, Copy, DownloadSimple, Eye, EyeSlash, Key } from '@phosphor-icons/react';
import { type FormEvent, useId, useState } from 'react';
import { basicAuthorization, JiraApiError } from '../../../api/jira-client';
import { mcpUrl } from '../../../api/jira-config';
import { Button } from '../../../components/Button';
import { FormField } from '../../../components/FormField';
import { Modal } from '../../../components/Modal';
import { Notice } from '../../../components/Notice';
import { useCopyToClipboard } from '../../../hooks/useCopyToClipboard';
import { downloadBlob } from '../../../lib/downloadFile';
import { useJiraConnectionStore } from '../../../store/useJiraConnectionStore';
import type { ConnectedUser } from '../../jira-connection/api/connection-api';
import { useVerifyCredentialsMutation } from '../../jira-connection/api/useVerifyCredentialsMutation';
import { validateInstitutionalEmail } from '../../jira-connection/lib/validateInstitutionalEmail';
import { jiraSiteUrl, type McpClient, type McpInstall } from '../lib/mcpConfig';
import { CodeSnippet } from './CodeSnippet';
import styles from './McpInstallDialog.module.css';

const API_TOKENS_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens';

const TOKEN_SCOPES = ['read:jira-work', 'read:jira-user', 'write:jira-work'] as const;

interface McpInstallDialogProps {
  client: McpClient;
  onClose: () => void;
}

interface VerifiedToken {
  email: string;
  token: string;
  user: ConnectedUser;
}

function describeVerifyError(cause: unknown): string {
  if (cause instanceof JiraApiError && (cause.status === 401 || cause.status === 403)) {
    return 'E-mail ou token inválidos. Confira se o token foi copiado inteiro e se é da conta deste e-mail.';
  }
  return cause instanceof Error ? cause.message : 'Não foi possível validar o token.';
}

/**
 * Instalação do MCP num cliente: o aviso de que o padrão é o token cadastrado
 * (gravado em texto aberto na configuração do cliente, ou no chaveiro do sistema
 * pela extensão do Claude Desktop), a troca por outro token (validado no Jira
 * antes) e o jeito de instalar daquele cliente: link, arquivo ou comando.
 */
export function McpInstallDialog({ client, onClose }: McpInstallDialogProps) {
  const titleId = useId();
  const guideId = useId();
  const emailId = useId();
  const tokenId = useId();
  const credentials = useJiraConnectionStore((state) => state.credentials);
  const registeredToken = credentials?.authMethod === 'oauth' ? null : credentials;
  const [choice, setChoice] = useState<'registered' | 'other'>(registeredToken ? 'registered' : 'other');
  const [email, setEmail] = useState(credentials?.email ?? '');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [verified, setVerified] = useState<VerifiedToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const verify = useVerifyCredentialsMutation();
  const commandCopy = useCopyToClipboard();
  const tokenCopy = useCopyToClipboard();
  const [isDownloading, setIsDownloading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const auth = choice === 'registered' ? registeredToken : verified;
  const authorization = auth ? basicAuthorization(auth) : null;
  const siteUrl = credentials?.domain ? jiraSiteUrl(credentials.domain) : null;
  const install = auth && authorization && siteUrl ? client.install(mcpUrl(credentials?.domain), { email: auth.email, authorization, siteUrl }) : null;

  // Mudar o e-mail ou o token pede validar de novo.
  function editOther(change: () => void) {
    change();
    setVerified(null);
    setError(null);
  }

  async function handleDownload(download: NonNullable<McpInstall['download']>) {
    setIsDownloading(true);
    setActionError(null);
    try {
      downloadBlob(download.fileName, await download.build());
    } catch (cause) {
      setActionError(`Não foi possível montar o arquivo: ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleCopy(copy: (text: string) => Promise<boolean>, text: string, what: string) {
    setActionError((await copy(text)) ? null : `O navegador não deixou copiar ${what}.`);
  }

  function handleVerify(event: FormEvent) {
    event.preventDefault();
    const pair = { email: email.trim(), token: token.trim(), cloudId: credentials?.cloudId ?? '' };
    const emailProblem = validateInstitutionalEmail(pair.email);
    if (emailProblem) return setError(emailProblem);
    if (!pair.token) return setError('Cole o token.');
    setError(null);
    verify.mutate(pair, {
      onSuccess: (user) => setVerified({ ...pair, user }),
      onError: (cause) => setError(describeVerifyError(cause)),
    });
  }

  return (
    <Modal
      labelledBy={titleId}
      onClose={onClose}
      header={
        <>
          <h2 id={titleId} className={styles.title}>
            Instalar no {client.name}
          </h2>
          <p className={styles.subtitle}>{client.detail}</p>
        </>
      }
    >
      {client.tokenStorage === 'keychain' ? (
        <Notice tone="warning">
          A extensão pede o e-mail e o token na instalação, e o {client.name} guarda o token no chaveiro do sistema
          (Keychain no Mac, Gerenciador de Credenciais no Windows). Por padrão, cole o <strong>token cadastrado</strong>{' '}
          neste navegador{credentials ? ` (${credentials.email})` : ''}. Se preferir, use outro token, só para o MCP, que
          você pode revogar sem desconectar o app.
        </Notice>
      ) : (
        <Notice tone="warning">
          A instalação usa, por padrão, o <strong>token cadastrado</strong> neste navegador
          {credentials ? ` (${credentials.email})` : ''}. Ele fica gravado em texto aberto na configuração do {client.name},
          no header <code>Authorization</code>: quem tiver esse arquivo usa o Jira como você. Se preferir, instale com outro
          token, só para o MCP, que você pode revogar sem desconectar o app.
        </Notice>
      )}

      <section className={styles.guide} aria-labelledby={guideId}>
        <h3 id={guideId} className={styles.legend}>
          Como gerar o token
        </h3>
        <ol className={styles.steps}>
          <li>
            Abra a{' '}
            <a className={styles.externalLink} href={API_TOKENS_URL} target="_blank" rel="noreferrer">
              página de tokens da Atlassian
              <ArrowSquareOut size={12} weight="bold" aria-hidden />
              <span className="sr-only"> (abre em nova aba)</span>
            </a>{' '}
            e entre com a conta do Jira.
          </li>
          <li>
            Clique em <strong>Criar token de API com escopos</strong>, dê um nome e escolha o app <strong>Jira</strong>.
          </li>
          <li>
            Marque estes escopos:
            <ul className={styles.scopes}>
              {TOKEN_SCOPES.map((scope) => (
                <li key={scope}>
                  <code>{scope}</code>
                </li>
              ))}
            </ul>
          </li>
          <li>
            Crie o token e copie na hora: a Atlassian só mostra ele uma vez. Cole em <strong>Outro token</strong> e valide.
            O login com Atlassian não serve aqui: ele expira em cerca de uma hora.
          </li>
        </ol>
      </section>

      <fieldset className={styles.choices}>
        <legend className={styles.legend}>Token da instalação</legend>
        <label className={styles.choice}>
          <input
            type="radio"
            name="mcp-token"
            checked={choice === 'registered'}
            disabled={!registeredToken}
            onChange={() => setChoice('registered')}
          />
          <span className={styles.choiceText}>
            <span className={styles.choiceName}>Token cadastrado</span>
            <span className={styles.choiceHint}>
              {registeredToken
                ? registeredToken.email
                : credentials?.authMethod === 'oauth'
                  ? 'O login com Atlassian expira e não deve ir para a configuração do cliente. Use um token de API.'
                  : 'Nenhuma conta conectada.'}
            </span>
          </span>
        </label>
        <label className={styles.choice}>
          <input type="radio" name="mcp-token" checked={choice === 'other'} onChange={() => setChoice('other')} />
          <span className={styles.choiceText}>
            <span className={styles.choiceName}>Outro token</span>
            <span className={styles.choiceHint}>
              Escopos: <code>read:jira-work</code> e <code>read:jira-user</code> para ler; <code>write:jira-work</code> para
              criar subtarefas, lançar horas e mudar status.
            </span>
          </span>
        </label>
      </fieldset>

      {choice === 'other' && (
        <form className={styles.otherToken} onSubmit={handleVerify} noValidate>
          <FormField label="E-mail da conta" htmlFor={emailId}>
            <input
              id={emailId}
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => editOther(() => setEmail(event.target.value))}
            />
          </FormField>
          <FormField
            label="Token da API"
            htmlFor={tokenId}
            hint={
              <a href={API_TOKENS_URL} target="_blank" rel="noreferrer" className={styles.externalLink}>
                Criar um token na Atlassian <ArrowSquareOut size={12} weight="bold" aria-hidden />
              </a>
            }
          >
            <div className={styles.secretField}>
              <input
                id={tokenId}
                className="input"
                type={showToken ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                value={token}
                onChange={(event) => editOther(() => setToken(event.target.value))}
              />
              <button
                type="button"
                className={styles.reveal}
                onClick={() => setShowToken((visible) => !visible)}
                aria-label={showToken ? 'Ocultar token' : 'Mostrar token'}
                aria-pressed={showToken}
              >
                {showToken ? <EyeSlash size={16} weight="bold" /> : <Eye size={16} weight="bold" />}
              </button>
            </div>
          </FormField>
          {error && <Notice tone="error">{error}</Notice>}
          {verified ? (
            <Notice tone="success">
              Token válido, da conta de {verified.user.displayName}. A instalação abaixo usa este token.
            </Notice>
          ) : (
            <Button type="submit" variant="primary" className={styles.verify} disabled={verify.isPending}>
              {verify.isPending ? 'Validando…' : 'Validar token'}
            </Button>
          )}
        </form>
      )}

      {install && auth && authorization ? (
        <section className={styles.install} aria-label={`Como instalar no ${client.name}`}>
          <div className={styles.actions}>
            {install.deepLink && (
              <a className={styles.primaryAction} href={install.deepLink.href}>
                <ArrowSquareOut size={15} weight="bold" aria-hidden />
                {install.deepLink.label}
              </a>
            )}
            {install.download && (
              <button
                type="button"
                className={styles.primaryAction}
                disabled={isDownloading}
                onClick={() => void handleDownload(install.download!)}
              >
                <DownloadSimple size={15} weight="bold" aria-hidden />
                {isDownloading ? 'Preparando…' : install.download.label}
              </button>
            )}
            {install.copyLabel && (
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => void handleCopy(commandCopy.copy, install.snippet.text, 'o comando')}
              >
                {commandCopy.copied ? <Check size={15} weight="bold" aria-hidden /> : <Copy size={15} weight="bold" aria-hidden />}
                {commandCopy.copied ? 'Copiado' : install.copyLabel}
              </button>
            )}
            {install.copyToken && (
              <Button
                variant="secondary"
                icon={tokenCopy.copied ? <Check size={14} weight="bold" aria-hidden /> : <Key size={14} weight="bold" aria-hidden />}
                onClick={() => void handleCopy(tokenCopy.copy, auth.token, 'o token')}
              >
                {tokenCopy.copied ? 'Token copiado' : 'Copiar token'}
              </Button>
            )}
          </div>
          {actionError && <Notice tone="error">{actionError}</Notice>}
          <ol className={styles.steps}>
            {install.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <CodeSnippet target={install.snippet.target} text={install.snippet.text} authorization={authorization} />
        </section>
      ) : (
        <p className={styles.pending}>
          {!siteUrl
            ? 'Conecte a conta do Jira para a instalação levar o site dela.'
            : choice === 'other'
              ? 'Valide o token para ver a instalação.'
              : 'Conecte sua conta do Jira para instalar.'}
        </p>
      )}
    </Modal>
  );
}
