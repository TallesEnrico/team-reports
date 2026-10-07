import { create } from 'zustand';
import { JIRA_CLOUD_ID, JIRA_SITE_DOMAIN } from '../api/jira-config';
import { clearPendingJiraWrites } from '@/api/pendingJiraWrite';
import { clearOAuthPending } from '../features/jira-connection/lib/oauthPending';
import { deleteEncrypted, loadEncrypted, saveEncrypted } from '../lib/encryptedStorage';

export type JiraAuthMethod = 'basic' | 'oauth';

export interface JiraCredentials {
  /** E-mail da conta no Jira (usuário do Basic auth, ou e-mail devolvido pelo OAuth). */
  email: string;
  /** API token da Atlassian, ou access token OAuth quando `authMethod` é `oauth`. */
  token: string;
  /** Chave do projeto Jira da squad (ex: "CLI"). */
  squad: string;
  /** Cloud ID do site (`cloudId` em `https://{domínio}.atlassian.net/_edge/tenant_info`). */
  cloudId: string;
  /** Nome do site, o trecho antes de `.atlassian.net`. */
  domain: string;
  /** Ausente nas contas já salvas: token de API (Basic). */
  authMethod?: JiraAuthMethod;
  /** Epoch ms em que o access token OAuth expira. */
  expiresAt?: number;
  /** Refresh token OAuth. Ausente nas contas que entraram antes da renovação. */
  refreshToken?: string;
}

type ConnectionStatus = 'loading' | 'disconnected' | 'connected';

interface JiraConnectionState {
  status: ConnectionStatus;
  credentials: JiraCredentials | null;
  /**
   * O Jira deixou de aceitar o token conectado (expirou ou foi revogado na
   * Atlassian): todas as requisições falham até a pessoa conectar um token novo.
   */
  tokenRejected: boolean;
  /** O aviso do token recusado foi fechado ("Agora não"); o rodapé da lateral continua avisando. */
  rejectionDismissed: boolean;
  /** O assistente está aberto para trocar só o token (mesma conta e squad). */
  isReconnecting: boolean;
  markTokenRejected: () => void;
  dismissRejection: () => void;
  startReconnect: () => void;
  cancelReconnect: () => void;
  /** Lê e decifra as credenciais salvas; chamado ao abrir o app. */
  load: () => Promise<void>;
  /** Cifra e salva as credenciais e passa a usá-las em todas as requisições. */
  connect: (credentials: JiraCredentials) => Promise<void>;
  /** Troca a squad da conta (Configurações > Meu cliente), com o mesmo e-mail e token. */
  changeSquad: (squad: string) => Promise<void>;
  /** Grava o par novo do OAuth no lugar do access token que está expirando. */
  replaceOAuthTokens: (tokens: { token: string; refreshToken: string; expiresAt: number }) => Promise<void>;
  disconnect: () => Promise<void>;
}

const RECORD_ID = 'jira-connection';

function readCredentials(value: unknown): JiraCredentials | null {
  const record = value as Partial<JiraCredentials> | null;
  if (typeof record?.email !== 'string' || typeof record.token !== 'string' || typeof record.squad !== 'string') return null;
  const authMethod = record.authMethod === 'oauth' || record.authMethod === 'basic' ? record.authMethod : undefined;
  const expiresAt = typeof record.expiresAt === 'number' ? record.expiresAt : undefined;
  const refreshToken =
    authMethod === 'oauth' &&
    typeof record.refreshToken === 'string' &&
    record.refreshToken.length >= 20 &&
    record.refreshToken.length <= 8192
      ? record.refreshToken
      : undefined;
  return {
    email: record.email,
    token: record.token,
    squad: record.squad,
    cloudId: typeof record.cloudId === 'string' && record.cloudId ? record.cloudId : JIRA_CLOUD_ID,
    domain: typeof record.domain === 'string' && record.domain ? record.domain : JIRA_SITE_DOMAIN,
    authMethod,
    expiresAt,
    refreshToken,
  };
}

function oauthUnrecoverable(credentials: JiraCredentials): boolean {
  if (credentials.authMethod !== 'oauth') return false;
  const accessUsable = typeof credentials.expiresAt === 'number' && credentials.expiresAt > Date.now();
  if (accessUsable) return false;
  return !credentials.refreshToken;
}

export async function readStoredJiraCredentials(): Promise<JiraCredentials | null> {
  return readCredentials(await loadEncrypted<unknown>(RECORD_ID));
}

/**
 * Conta do Jira usada pelo app. Fica cifrada no IndexedDB (lib/encryptedStorage)
 * e decifrada só em memória enquanto a página está aberta.
 */
export const useJiraConnectionStore = create<JiraConnectionState>()((set, get) => ({
  status: 'loading',
  credentials: null,
  tokenRejected: false,
  rejectionDismissed: false,
  isReconnecting: false,
  markTokenRejected: () =>
    set((state) => (state.tokenRejected ? {} : { tokenRejected: true, rejectionDismissed: false })),
  dismissRejection: () => set({ rejectionDismissed: true }),
  startReconnect: () => set({ isReconnecting: true }),
  cancelReconnect: () => set({ isReconnecting: false }),
  load: async () => {
    const saved = await loadEncrypted<unknown>(RECORD_ID);
    const credentials = readCredentials(saved);
    set({
      credentials,
      status: credentials ? 'connected' : 'disconnected',
      tokenRejected: credentials ? oauthUnrecoverable(credentials) : false,
    });
  },
  connect: async (credentials) => {
    await saveEncrypted(RECORD_ID, credentials);
    await clearOAuthPending();
    set({ credentials, status: 'connected', tokenRejected: oauthUnrecoverable(credentials), rejectionDismissed: false, isReconnecting: false });
  },
  replaceOAuthTokens: async ({ token, refreshToken, expiresAt }) => {
    const { credentials } = get();
    if (!credentials || credentials.authMethod !== 'oauth') return;
    const next = { ...credentials, token, refreshToken, expiresAt };
    await saveEncrypted(RECORD_ID, next);
    set({ credentials: next, tokenRejected: false, rejectionDismissed: false });
  },
  changeSquad: async (squad) => {
    const { credentials } = get();
    if (!credentials || credentials.squad === squad) return;
    const next = { ...credentials, squad };
    await saveEncrypted(RECORD_ID, next);
    set({ credentials: next });
  },
  disconnect: async () => {
    await deleteEncrypted(RECORD_ID);
    await clearOAuthPending();
    clearPendingJiraWrites();
    set({ credentials: null, status: 'disconnected', tokenRejected: false, rejectionDismissed: false, isReconnecting: false });
  },
}));

/** `true` com uma conta conectada; as queries do Jira só rodam assim. */
export function useIsJiraConnected(): boolean {
  return useJiraConnectionStore((state) => state.status === 'connected');
}
