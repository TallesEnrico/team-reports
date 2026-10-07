import { JiraApiError } from '../../../api/jira-client';
import type { JiraAccount } from '../../../api/jira-users';
import type { PeerProfile, VerifiedAccount } from './protocol';

/**
 * Por que um dispositivo ficou fora da sala:
 * - `not-found`: a conta não existe no Jira da empresa;
 * - `not-a-person`: é conta de app ou de cliente do Service Management;
 * - `inactive`: a conta está desativada;
 * - `email-mismatch`: o Jira mostra outro e-mail para a conta;
 * - `forbidden`: a sua conta não pode consultar pessoas no Jira;
 * - `unavailable`: o Jira não respondeu (ou chegaram contas novas demais de uma vez).
 */
export type RejectReason = 'not-found' | 'not-a-person' | 'inactive' | 'email-mismatch' | 'forbidden' | 'unavailable';

export type Verification = { ok: true; account: VerifiedAccount } | { ok: false; reason: RejectReason };

/**
 * O que o Jira da empresa diz da conta que o dispositivo afirma ter. Isso
 * confirma que a conta existe e está ativa, não que o dispositivo é dela.
 */
export function checkAccount(profile: PeerProfile, account: JiraAccount | null): Verification {
  if (!account || account.accountId !== profile.accountId) return { ok: false, reason: 'not-found' };
  if (account.accountType !== 'atlassian') return { ok: false, reason: 'not-a-person' };
  if (account.active === false) return { ok: false, reason: 'inactive' };
  // O e-mail só vem quando a privacidade do perfil deixa; quando vem, precisa ser o que o dispositivo disse.
  const email = account.emailAddress?.trim().toLowerCase() || null;
  if (email && email !== profile.email) return { ok: false, reason: 'email-mismatch' };
  return { ok: true, account: { accountId: account.accountId, name: account.displayName, avatarUrl: account.avatarUrl ?? null, email } };
}

/**
 * Contas novas consultadas por minuto (as já conferidas vêm do cache): um
 * dispositivo inventando contas não gasta o limite do Jira de quem está na sala.
 */
const MAX_LOOKUPS_PER_MINUTE = 30;

export interface AccountLookup {
  /** A conta já conferida (`null`: não existe); `undefined` se ainda não foi consultada. */
  cached: (accountId: string) => JiraAccount | null | undefined;
  fetch: (accountId: string) => Promise<JiraAccount | null>;
}

/** Erro da consulta: sem permissão para ver pessoas, ou o Jira não respondeu. */
export function lookupFailure(error: unknown): RejectReason {
  return error instanceof JiraApiError && error.status === 403 ? 'forbidden' : 'unavailable';
}

/** Confere no Jira a conta que cada dispositivo diz ter, antes de ele entrar na lista. */
export function createPeerVerifier(lookup: AccountLookup): (profile: PeerProfile) => Promise<Verification> {
  let lookups: number[] = [];
  return async (profile) => {
    let account = lookup.cached(profile.accountId);
    if (account === undefined) {
      const now = Date.now();
      lookups = lookups.filter((time) => now - time < 60_000);
      if (lookups.length >= MAX_LOOKUPS_PER_MINUTE) return { ok: false, reason: 'unavailable' };
      lookups.push(now);
      try {
        account = await lookup.fetch(profile.accountId);
      } catch (error) {
        return { ok: false, reason: lookupFailure(error) };
      }
    }
    return checkAccount(profile, account);
  };
}

function devices(count: number): string {
  return count === 1 ? '1 dispositivo' : `${count} dispositivos`;
}

/** O aviso dos dispositivos recusados na conferência do Jira, para a lista e para Configurações. */
export function rejectionSummary(rejected: Partial<Record<RejectReason, number>>): string[] {
  const unconfirmed = (rejected['not-found'] ?? 0) + (rejected['not-a-person'] ?? 0) + (rejected.inactive ?? 0) + (rejected['email-mismatch'] ?? 0);
  const unchecked = (rejected.unavailable ?? 0) + (rejected.forbidden ?? 0);
  const lines: string[] = [];
  if (unconfirmed > 0) {
    lines.push(
      `${devices(unconfirmed)} ${unconfirmed === 1 ? 'ficou' : 'ficaram'} de fora: a conta do Jira que ${unconfirmed === 1 ? 'ele diz' : 'eles dizem'} ter não existe, está desativada ou não confere no Jira da empresa.`,
    );
  }
  if (unchecked > 0) {
    lines.push(`${devices(unchecked)} não ${unchecked === 1 ? 'pôde' : 'puderam'} ser ${unchecked === 1 ? 'conferido' : 'conferidos'} agora: o Jira não respondeu.`);
  }
  return lines;
}
