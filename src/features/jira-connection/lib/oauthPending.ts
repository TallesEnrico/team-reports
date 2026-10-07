import { deleteEncrypted, loadEncrypted, saveEncrypted } from '@/lib/encryptedStorage';

export const OAUTH_PENDING_RECORD = 'jira-oauth-pending';

export interface OAuthSite {
  cloudId: string;
  url: string;
  name: string;
  domain: string;
}

export interface OAuthPending {
  accessToken: string;
  expiresAt: number;
  email: string;
  accountId: string;
  displayName: string;
  sites: OAuthSite[];
}

export async function saveOAuthPending(pending: OAuthPending): Promise<void> {
  await saveEncrypted(OAUTH_PENDING_RECORD, pending);
}

export async function loadOAuthPending(): Promise<OAuthPending | null> {
  const pending = await loadEncrypted<OAuthPending>(OAUTH_PENDING_RECORD);
  if (!pending || typeof pending.accessToken !== 'string' || !Array.isArray(pending.sites) || pending.sites.length === 0) return null;
  if (typeof pending.expiresAt !== 'number' || pending.expiresAt <= Date.now()) {
    await deleteEncrypted(OAUTH_PENDING_RECORD);
    return null;
  }
  return pending;
}

export async function clearOAuthPending(): Promise<void> {
  await deleteEncrypted(OAUTH_PENDING_RECORD);
}
