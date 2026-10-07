import { ArrowSquareOut, CheckCircle, CircleNotch, Eye, EyeSlash, WarningCircle } from '@phosphor-icons/react';
import { type FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { JiraApiError } from '../../../api/jira-client';
import { BrandLogo } from '../../../components/BrandLogo';
import { Button } from '../../../components/Button';
import { FormField } from '../../../components/FormField';
import { SingleSelect } from '../../../components/SingleSelect';
import { cx } from '../../../lib/cx';
import { type JiraCredentials, useJiraConnectionStore } from '../../../store/useJiraConnectionStore';
import type { ConnectedUser, JiraSignIn } from '../api/connection-api';
import { useSquadsQuery } from '../api/useSquadsQuery';
import { useVerifyCredentialsMutation } from '../api/useVerifyCredentialsMutation';
import { startAtlassianLogin } from '../lib/atlassianOAuth';
import { fetchTenantCloudId } from '../lib/fetchTenantCloudId';
import { loadOAuthPending, type OAuthPending } from '../lib/oauthPending';
import { readSiteDomain } from '../lib/siteHint';
import { parseSiteShare } from '../lib/siteShare';
import { normalizeJiraDomain, parseCloudId, tenantInfoUrl, validateJiraSite } from '../lib/validateJiraSite';
import { validateInstitutionalEmail } from '../lib/validateInstitutionalEmail';
import styles from './ConnectionWizard.module.css';
import { WizardSteps } from './WizardSteps';

const API_TOKENS_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens';

// Relatório (as duas primeiras) e quadro do Kanban (API Agile, só com escopos granulares).
const READ_SCOPES = [
  'read:jira-work',
  'read:jira-user',
  'read:board-scope:jira-software',
  'read:board-scope.admin:jira-software',
  'read:project:jira',
];

// O site vem antes: e-mail e token só autenticam no cloud ID informado.
const STEPS = ['Site', 'E-mail', 'Token', 'Squad'] as const;

interface SquadOption {
  value: string;
  label: string;
}

interface ConnectionWizardProps {
  /** Chamado depois que as credenciais foram validadas, cifradas e salvas. */
  onConnected?: (credentials: JiraCredentials) => void;
  /** Falha ao voltar do login da Atlassian. */
  notice?: string | null;
  /**
   * Trocar só o token (o anterior expirou ou foi revogado): começa no passo do
   * token, com o e-mail da conta, e mantém a squad.
   */
  reconnect?: { email: string; squad: string; cloudId: string; domain: string };
  /** Fechar sem conectar (só ao conectar de novo: sem conta nenhuma, o app não funciona). */
  onCancel?: () => void;
}

function describeVerifyError(cause: unknown): string {
  if (cause instanceof JiraApiError && (cause.status === 401 || cause.status === 403)) {
    return 'E-mail ou token inválidos. Confira se o token foi copiado inteiro, se é da conta deste e-mail e se tem os escopos read:jira-work e read:jira-user.';
  }
  return cause instanceof Error ? cause.message : 'Não foi possível validar o token.';
}

/** Assistente de primeiro acesso: conecta a conta do Jira em quatro passos. */
export function ConnectionWizard({ onConnected, notice, reconnect, onCancel }: ConnectionWizardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const bindInput = useCallback((node: HTMLInputElement | null) => {
    inputRef.current = node;
  }, []);
  const bindTextArea = useCallback((node: HTMLTextAreaElement | null) => {
    inputRef.current = node;
  }, []);
  const titleId = useId();
  const domainId = useId();
  const cloudIdFieldId = useId();
  const emailId = useId();
  const tokenId = useId();
  const squadId = useId();
  const siteSelectId = useId();

  const skipSiteLookup = Boolean(reconnect);
  const hintedDomain = skipSiteLookup ? null : readSiteDomain(window.location);
  const [step, setStep] = useState(reconnect ? 2 : 0);
  const [resolvingSite, setResolvingSite] = useState(Boolean(hintedDomain));
  const [siteLookupMissed, setSiteLookupMissed] = useState(false);
  const [domain, setDomain] = useState(reconnect?.domain ?? hintedDomain ?? '');
  const [cloudId, setCloudId] = useState(reconnect?.cloudId ?? '');
  const [siteJson, setSiteJson] = useState('');
  const [email, setEmail] = useState(reconnect?.email ?? '');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [verifiedUser, setVerifiedUser] = useState<ConnectedUser | null>(null);
  const [squad, setSquad] = useState<SquadOption | null>(null);
  const [error, setError] = useState<string | null>(notice ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [oauthPending, setOauthPending] = useState<OAuthPending | null>(null);
  const [oauthSiteId, setOauthSiteId] = useState<string | null>(null);
  const [oauthChecked, setOauthChecked] = useState(Boolean(reconnect));

  const connect = useJiraConnectionStore((state) => state.connect);
  const verify = useVerifyCredentialsMutation();
  const siteDomain = normalizeJiraDomain(domain);
  const siteCloudId = parseCloudId(cloudId) ?? '';
  const infoUrl = tenantInfoUrl(domain);
  const manualSignIn: JiraSignIn = { email: email.trim(), token: token.trim(), cloudId: siteCloudId, authMethod: 'basic' };
  const oauthSite = oauthPending?.sites.find((site) => site.cloudId === oauthSiteId) ?? oauthPending?.sites[0] ?? null;
  const oauthSignIn: JiraSignIn | null =
    oauthPending && oauthSite
      ? {
          email: oauthPending.email,
          token: oauthPending.accessToken,
          cloudId: oauthSite.cloudId,
          authMethod: 'oauth',
          expiresAt: oauthPending.expiresAt,
        }
      : null;
  const squadsQuery = useSquadsQuery(oauthSignIn ?? (verifiedUser ? manualSignIn : null));
  const squadOptions = useMemo<SquadOption[]>(
    () => (squadsQuery.data ?? []).map((item) => ({ value: item.key, label: `${item.name} (${item.key})` })),
    [squadsQuery.data],
  );

  const canDismiss = Boolean(reconnect);
  useEffect(() => {
    if (!oauthChecked) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.setAttribute('closedby', canDismiss ? 'closerequest' : 'none');
    if (!dialog.open) dialog.showModal();

    function blockDismiss(event: Event) {
      if (!canDismiss) event.preventDefault();
    }

    function reopen() {
      const current = dialogRef.current;
      if (!canDismiss && current?.isConnected && !current.open) current.showModal();
    }

    dialog.addEventListener('cancel', blockDismiss);
    dialog.addEventListener('close', reopen);
    return () => {
      dialog.removeEventListener('cancel', blockDismiss);
      dialog.removeEventListener('close', reopen);
      dialog.close();
    };
  }, [oauthChecked, canDismiss]);

  useEffect(() => {
    if (resolvingSite) return;
    inputRef.current?.focus();
  }, [step, resolvingSite]);

  useEffect(() => {
    if (!hintedDomain) return;
    const controller = new AbortController();
    void fetchTenantCloudId(hintedDomain, controller.signal).then((found) => {
      if (controller.signal.aborted) return;
      if (found) {
        setCloudId(found);
        setStep((current) => (current === 3 ? current : 1));
      } else {
        setSiteLookupMissed(true);
      }
      setResolvingSite(false);
    });
    return () => controller.abort();
  }, [hintedDomain]);

  useEffect(() => {
    if (reconnect) return;
    let cancelled = false;
    void loadOAuthPending()
      .then((pending) => {
        if (cancelled) return;
        if (pending) {
          setOauthPending(pending);
          setOauthSiteId(pending.sites[0]?.cloudId ?? null);
          setEmail(pending.email);
          setVerifiedUser({ accountId: pending.accountId, displayName: pending.displayName });
          setStep(3);
        }
        setOauthChecked(true);
      })
      .catch(() => {
        if (!cancelled) setOauthChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reconnect]);

  const isBusy = verify.isPending || isSaving;

  function goTo(next: number) {
    setError(null);
    setStep(next);
  }

  function handleSiteJson(text: string) {
    setSiteJson(text);
    const parsed = parseSiteShare(text);
    if (!parsed.ok) return;
    setDomain(parsed.site.domain);
    setCloudId(parsed.site.clientId);
    setVerifiedUser(null);
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (resolvingSite && !oauthPending) return;
    setError(null);

    if (step === 0) {
      const problem = validateJiraSite(domain, cloudId);
      if (problem) {
        if (siteJson.trim()) {
          const parsed = parseSiteShare(siteJson);
          if (!parsed.ok) return setError(parsed.error);
        }
        return setError(problem);
      }
      setVerifiedUser(null);
      return goTo(1);
    }

    if (step === 1) {
      const problem = validateInstitutionalEmail(email);
      if (problem) return setError(problem);
      // Outro e-mail invalida a validação anterior do token.
      setVerifiedUser(null);
      return goTo(2);
    }

    if (step === 2) {
      if (!manualSignIn.token) return setError('Cole o token gerado na Atlassian.');
      try {
        setVerifiedUser(await verify.mutateAsync(manualSignIn));
      } catch (cause) {
        setError(describeVerifyError(cause));
        return;
      }
      if (reconnect) {
        setIsSaving(true);
        try {
          const connection: JiraCredentials = {
            ...manualSignIn,
            cloudId: reconnect.cloudId,
            domain: reconnect.domain,
            squad: reconnect.squad,
            authMethod: 'basic',
          };
          await connect(connection);
          onConnected?.(connection);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a conexão.');
          setIsSaving(false);
        }
        return;
      }
      goTo(3);
      return;
    }

    if (!squad) return setError('Selecione sua squad.');
    if (oauthPending && !oauthSite) return setError('Selecione o site do Jira.');
    setIsSaving(true);
    try {
      const connection: JiraCredentials =
        oauthPending && oauthSite
          ? {
              email: oauthPending.email,
              token: oauthPending.accessToken,
              squad: squad.value,
              cloudId: oauthSite.cloudId,
              domain: oauthSite.domain,
              authMethod: 'oauth',
              expiresAt: oauthPending.expiresAt,
            }
          : { ...manualSignIn, domain: siteDomain, squad: squad.value, authMethod: 'basic' };
      await connect(connection);
      onConnected?.(connection);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a conexão.');
      setIsSaving(false);
    }
  }

  let submitLabel = step < 2 ? 'Continuar' : step === 2 ? (verify.isPending ? 'Validando…' : 'Validar token') : isSaving ? 'Salvando…' : 'Concluir';
  if (reconnect) submitLabel = verify.isPending ? 'Validando…' : isSaving ? 'Salvando…' : 'Validar e conectar';

  const [copySuccess, setCopySuccess] = useState(false);
  
  const copyScopes = () => {
    const scopesText = [...READ_SCOPES, 'write:jira-work'].join('\n');
    navigator.clipboard.writeText(scopesText).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    }).catch(() => {
      setError('Não foi possível copiar os escopos.');
    });
  };

  if (!oauthChecked) return null;

  return (
    <dialog
      ref={dialogRef}
      className={cx(styles.dialog, step === 3 && styles.dialogOpenMenu)}
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (!canDismiss || isBusy) {
          event.preventDefault();
          return;
        }
        onCancel?.();
      }}
    >
      <form className={styles.card} onSubmit={handleSubmit} noValidate>
        <header className={styles.header}>
          <BrandLogo product="reports" size="compact" className={styles.logo} />
          <h1 id={titleId} className={styles.title}>
            {reconnect ? 'Conectar de novo' : 'Conectar ao Jira'}
          </h1>
          <p className={styles.subtitle}>
            {reconnect
              ? 'O Jira não aceita mais o token desta conta: ele expirou ou foi revogado na Atlassian. Crie um token novo para a mesma conta e cole abaixo. A squad e o resto continuam como estão.'
              : oauthPending
                ? 'A Atlassian autorizou o Team Reportss. Escolha a squad. O acesso fica criptografado neste navegador e, quando expirar, entre de novo.'
                : 'Quatro passos para gerar seus relatórios. Os dados ficam salvos criptografados neste navegador.'}
          </p>
        </header>

        {!reconnect && !oauthPending && <WizardSteps steps={STEPS} current={step} />}

        <div className={styles.body}>
          {!reconnect && !oauthPending && step < 3 && (
            <>
              <Button
                variant="primary"
                className={styles.oauthButton}
                onClick={() => {
                  void startAtlassianLogin().catch((cause: unknown) => {
                    setError(cause instanceof Error ? cause.message : 'Não foi possível iniciar o login com a Atlassian.');
                  });
                }}
              >
                Entrar com Atlassian
              </Button>
              <p className={styles.or}>ou use um token de API</p>
            </>
          )}

          {resolvingSite && (
            <p className={styles.resolving} role="status">
              <CircleNotch size={16} weight="bold" className={styles.spinner} aria-hidden />
              Buscando o site do Jira…
            </p>
          )}

          {step === 0 && !resolvingSite && (
            <>
              {siteLookupMissed && (
                <p className={styles.text}>
                  Não encontrei o Cloud ID de <strong>{normalizeJiraDomain(domain) || 'esse domínio'}</strong>. Preencha o site
                  abaixo.
                </p>
              )}
              <FormField
                label="JSON do site"
                htmlFor={`${domainId}-json`}
                hint="Ao colar o JSON de Configurações, o domínio e o Cloud ID abaixo são preenchidos."
              >
                <textarea
                  ref={bindTextArea}
                  id={`${domainId}-json`}
                  className="input"
                  rows={5}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  placeholder={'{\n  "domain": "empresa",\n  "clientId": "00000000-0000-0000-0000-000000000000"\n}'}
                  value={siteJson}
                  onChange={(event) => handleSiteJson(event.target.value)}
                />
              </FormField>
              <p className={styles.or}>ou preencha os dois campos</p>
              <p className={styles.text}>
                O domínio é o nome do seu Jira. Abra o site no navegador: em{' '}
                <code className={styles.scope}>https://empresa.atlassian.net</code>, o domínio é{' '}
                <code className={styles.scope}>empresa</code>.
              </p>
              <FormField label="Domínio" htmlFor={domainId} hint="Só o nome, sem https:// e sem .atlassian.net.">
                <input
                  id={domainId}
                  className="input"
                  type="text"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="empresa"
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                />
              </FormField>
              <p className={styles.text}>
                Com o domínio, abra a página do site. Ela mostra um JSON: copie o valor de{' '}
                <code className={styles.scope}>cloudId</code>.
              </p>
              {infoUrl ? (
                <a className={`${styles.externalLink} ${styles.tenantLink}`} href={infoUrl} target="_blank" rel="noopener noreferrer">
                  <ArrowSquareOut size={16} weight="bold" aria-hidden />
                  {infoUrl}
                  <span className="sr-only"> (abre em nova aba)</span>
                </a>
              ) : (
                <p className={styles.tenantPattern}>
                  <code className={styles.scope}>https://{'{domínio}'}.atlassian.net/_edge/tenant_info</code>
                </p>
              )}
              <FormField label="Cloud ID" htmlFor={cloudIdFieldId} hint="O cloudId dessa página. Pode colar o JSON inteiro.">
                <input
                  id={cloudIdFieldId}
                  className={`input ${styles.monoInput}`}
                  type="text"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  value={cloudId}
                  onChange={(event) => setCloudId(event.target.value)}
                />
              </FormField>
            </>
          )}

          {step === 1 && (
            <FormField label="E-mail" htmlFor={emailId} hint="O mesmo e-mail da sua conta no Jira.">
              <input
                ref={bindInput}
                id={emailId}
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="nome@empresa.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </FormField>
          )}

          {step === 2 && (
            <>
              <p className={styles.text}>
                Na página de tokens da Atlassian, clique em <strong>Criar token de API com escopos</strong>, escolha o app{' '}
                <strong>Jira</strong> e marque os escopos de leitura:
              </p>
              <ul className={styles.scopeList}>
                {READ_SCOPES.map((scope) => (
                  <li key={scope}>
                    <code className={styles.scope}>{scope}</code>
                  </li>
                ))}
              </ul>
              <p className={styles.text}>
                Para editar e lançar horas e mover cards no Kanban, marque também{' '}
                <code className={styles.scope}>write:jira-work</code>. Sem ele, o app só lê dados.
              </p>
              
              <div className="flex flex-row justify-between items-end">
                <a className={styles.externalLink} href={API_TOKENS_URL} target="_blank" rel="noopener noreferrer">
                  <ArrowSquareOut size={16} weight="bold" aria-hidden />
                  Criar token na Atlassian
                  <span className="sr-only"> (abre em nova aba)</span>
                </a>

                <div className="flex flex-col">
                  {!copySuccess && <p className="text-blue-400 cursor-pointer hover:underline" onClick={copyScopes}>Copiar escopos para busca</p>}
                  {copySuccess && <p className="bg-green-soft rounded-md p-1 px-3 text-green-ink">Copiado com sucesso!</p>}
                </div>
              </div>

              <FormField label="Token de API" htmlFor={tokenId} hint={`Conta: ${manualSignIn.email}`}>
                <div className={styles.secretField}>
                  <input
                    ref={bindInput}
                    id={tokenId}
                    className="input"
                    type={showToken ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
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
            </>
          )}

          {step === 3 && (
            <>
              {verifiedUser && (
                <p className={styles.success}>
                  <CheckCircle size={16} weight="fill" aria-hidden />
                  Conectado como <strong>{verifiedUser.displayName}</strong>
                </p>
              )}
              {oauthPending && oauthPending.sites.length > 1 && (
                <FormField label="Site do Jira" htmlFor={siteSelectId} hint="A Atlassian autorizou mais de um site.">
                  <select
                    id={siteSelectId}
                    className="input"
                    value={oauthSite?.cloudId ?? ''}
                    onChange={(event) => {
                      setOauthSiteId(event.target.value);
                      setSquad(null);
                    }}
                  >
                    {oauthPending.sites.map((site) => (
                      <option key={site.cloudId} value={site.cloudId}>
                        {site.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
              <FormField
                label="Sua squad"
                htmlFor={squadId}
                hint={
                  squadsQuery.isError ? (
                    <>
                      Não foi possível carregar as squads.{' '}
                      <button type="button" className={styles.inlineButton} onClick={() => void squadsQuery.refetch()}>
                        Tentar de novo
                      </button>
                    </>
                  ) : (
                    'Ela vira o projeto padrão dos filtros.'
                  )
                }
              >
                <SingleSelect<SquadOption>
                  inputId={squadId}
                  autoFocus
                  placeholder="Busque pelo nome ou pela chave"
                  options={squadOptions}
                  value={squad}
                  onChange={setSquad}
                  isLoading={squadsQuery.isPending}
                  maxMenuHeight={220}
                />
              </FormField>
            </>
          )}

          {error && (
            <p className={styles.error} role="alert">
              <WarningCircle size={16} weight="bold" aria-hidden />
              {error}
            </p>
          )}
        </div>

        <footer className={styles.footer}>
          {reconnect ? (
            <Button variant="ghost" onClick={onCancel} disabled={isBusy}>
              Cancelar
            </Button>
          ) : step > 0 && !oauthPending ? (
            <Button variant="ghost" onClick={() => goTo(step - 1)} disabled={isBusy}>
              Voltar
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" disabled={isBusy || (resolvingSite && !oauthPending)}>
            {submitLabel}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
