import type { ImportErrorCode } from '../../builder/lib/transfer';
import { DEVICE_ID } from './device';
import { emailDomain, PEER_APP_ID } from './room';

/**
 * Formatos que vão de um navegador a outro pelo DataChannel. Tudo o que chega
 * vem de outra pessoa e é validado campo a campo: o que não passa é descartado.
 */

const PROTOCOL_VERSION = 1;

/** Quanto quem recebe tem para aceitar ou recusar; depois disso o pedido vence nos dois lados. */
export const SHARE_TIMEOUT_MS = 3 * 60_000;

/** Um dashboard real tem poucos KB (300 peças, o máximo do "Importar", ficam bem abaixo disso). */
export const MAX_SHARE_BYTES = 512 * 1024;

/** O recorte de um relatório (datas, pessoas, JQL) cabe num link; acima disso, o envio é recusado. */
export const MAX_REPORT_SHARE_BYTES = 16 * 1024;

/** Nome do dispositivo (o escolhido em Configurações ou o automático, com a primeira parte do e-mail). */
export const DEVICE_NAME_MAX = 60;

/**
 * O que um dispositivo diz de si: a conta do Jira (conferida pelo `accountId`
 * antes de entrar na lista) e o dispositivo (um navegador, com uma ou mais abas).
 * Nome e foto não vão: quem recebe busca no Jira, pela conta.
 */
export type PeerProfile = {
  /** E-mail da conta conectada, em minúsculas: o domínio dele é o da sala. */
  email: string;
  /** A conta no Jira da empresa: junta os dispositivos da mesma pessoa. */
  accountId: string;
  deviceId: string;
  deviceName: string;
};

/** A conta do Jira de um dispositivo, como o Jira da empresa a mostra (não como o dispositivo diz). */
export type VerifiedAccount = {
  accountId: string;
  name: string;
  avatarUrl: string | null;
  /** Só quando a privacidade do perfil deixa o Jira mostrar. */
  email: string | null;
};

/** Um dispositivo na sala: o que ele diz de si e a conta conferida no Jira. */
export type PeerEntry = { profile: PeerProfile; account: VerifiedAccount };

type ShareEnvelope = {
  v: typeof PROTOCOL_VERSION;
  shareId: string;
  from: string;
  to: string;
};

/**
 * O que vai de uma conta (`from`) para outra (`to`). Quem recebe confere as duas.
 * - `team-dashboard`: o .json do "Exportar" (só a montagem);
 * - `team-report`: a query do link de Reports (`from=…&to=…`), sem as horas.
 */
export type ShareRequest =
  | (ShareEnvelope & { type: 'team-dashboard'; file: string })
  | (ShareEnvelope & { type: 'team-report'; search: string });

/**
 * Por que quem recebe não aceitou o arquivo. Vai só o código: cada lado mostra
 * a própria mensagem, e nenhum texto de outra pessoa aparece como se fosse do app.
 */
export type InvalidCode =
  | ImportErrorCode
  | 'too-large'
  | 'bad-request'
  | 'wrong-recipient'
  | 'unavailable'
  | 'not-report'
  | 'report-too-large';

const INVALID_CODES = [
  'not-json',
  'not-dashboard',
  'newer-version',
  'no-pieces',
  'too-large',
  'bad-request',
  'wrong-recipient',
  'unavailable',
  'not-report',
  'report-too-large',
] as const satisfies readonly InvalidCode[];

/** O motivo, para quem enviou. */
export const INVALID_MESSAGES: Record<InvalidCode, string> = {
  'not-json': 'o arquivo chegou corrompido',
  'not-dashboard': 'o arquivo não é um dashboard do Dashboard',
  'newer-version': 'o outro lado tem uma versão mais antiga do Team Reports (peça para recarregar a página)',
  'no-pieces': 'nenhuma peça chegou válida',
  'too-large': 'o dashboard é grande demais (até 512 KB)',
  'bad-request': 'o pedido chegou fora do formato',
  'wrong-recipient': 'o envio não era para a conta desse dispositivo',
  'unavailable': 'o outro dispositivo não conseguiu abrir o envio agora',
  'not-report': 'o relatório chegou fora do formato',
  'report-too-large': 'o relatório é grande demais para enviar (use o link)',
};

/** A resposta de quem recebe. */
export type ShareResponse =
  | { status: 'accepted' }
  | { status: 'declined' }
  | { status: 'invalid'; code: InvalidCode }
  | { status: 'busy' }
  | { status: 'expired' };

/** Como um envio terminou, do lado de quem enviou. */
export type ShareOutcome =
  | ShareResponse
  | { status: 'timeout' }
  | { status: 'disconnected' }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string };

type Record_ = Record<string, unknown>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Texto de uma linha, sem caracteres de controle nem os que invertem a direção do texto. */
function line(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\p{Cc}​-‏‪-‮⁦-⁩﻿]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Só ASCII antes do @, e um domínio qualquer: nada de caracteres invisíveis ou que invertem o texto. */
const EMAIL_LOCAL_PART = /^[a-z0-9._%+-]{1,64}$/;
/** accountId do Jira (ex: 5b10ac8d82e05b22cc7d4ef5, 712020:f58131cb-…). */
export const ACCOUNT_ID = /^[\w:-]{1,128}$/;
const SHARE_ID = /^[A-Za-z0-9-]{8,64}$/;

/** O perfil de outro dispositivo, com um e-mail de qualquer domínio (a conta é conferida depois, no Jira). */
export function parsePeerProfile(value: unknown): PeerProfile | null {
  if (!isRecord(value) || typeof value.email !== 'string') return null;
  const email = value.email.trim().toLowerCase();
  const [localPart] = email.split('@');
  if (!EMAIL_LOCAL_PART.test(localPart) || !emailDomain(email)) return null;
  if (typeof value.accountId !== 'string' || !ACCOUNT_ID.test(value.accountId)) return null;
  if (typeof value.deviceId !== 'string' || !DEVICE_ID.test(value.deviceId)) return null;
  return {
    email,
    accountId: value.accountId,
    deviceId: value.deviceId,
    deviceName: line(value.deviceName, DEVICE_NAME_MAX) || 'Dispositivo',
  };
}

/** O perfil como vai no handshake e nas atualizações: com o app e a versão do protocolo. */
export function profileMessage(profile: PeerProfile) {
  return { app: PEER_APP_ID, v: PROTOCOL_VERSION, profile };
}

/** O perfil de um handshake ou atualização; `null` se é de outro app ou de outra versão. */
export function parseProfileMessage(value: unknown): PeerProfile | null {
  if (!isRecord(value) || value.app !== PEER_APP_ID || value.v !== PROTOCOL_VERSION) return null;
  return parsePeerProfile(value.profile);
}

export function shareRequest(shareId: string, from: string, to: string, file: string): ShareRequest {
  return { type: 'team-dashboard', v: PROTOCOL_VERSION, shareId, from, to, file };
}

export function reportShareRequest(shareId: string, from: string, to: string, search: string): ShareRequest {
  return { type: 'team-report', v: PROTOCOL_VERSION, shareId, from, to, search };
}

function parseEnvelope(value: Record_): Pick<ShareRequest, 'shareId' | 'from' | 'to'> | null {
  if (value.v !== PROTOCOL_VERSION) return null;
  if (typeof value.shareId !== 'string' || !SHARE_ID.test(value.shareId)) return null;
  if (typeof value.from !== 'string' || !ACCOUNT_ID.test(value.from)) return null;
  if (typeof value.to !== 'string' || !ACCOUNT_ID.test(value.to)) return null;
  return { shareId: value.shareId, from: value.from, to: value.to };
}

/** O envelope do pedido. O .json do dashboard e a query do relatório são validados depois. */
export function parseShareRequest(value: unknown): ShareRequest | null {
  if (!isRecord(value)) return null;
  const envelope = parseEnvelope(value);
  if (!envelope) return null;
  if (value.type === 'team-dashboard' && typeof value.file === 'string') {
    return { type: 'team-dashboard', v: PROTOCOL_VERSION, ...envelope, file: value.file };
  }
  if (value.type === 'team-report' && typeof value.search === 'string') {
    return { type: 'team-report', v: PROTOCOL_VERSION, ...envelope, search: value.search };
  }
  return null;
}

export function parseShareResponse(value: unknown): ShareResponse | null {
  if (!isRecord(value)) return null;
  switch (value.status) {
    case 'accepted':
    case 'declined':
    case 'busy':
    case 'expired':
      return { status: value.status };
    case 'invalid':
      return { status: 'invalid', code: INVALID_CODES.find((code) => code === value.code) ?? 'bad-request' };
    default:
      return null;
  }
}

/** Quem enviou desistiu (ou o tempo dele acabou): o pedido sai da tela de quem recebe. */
export function cancelMessage(shareId: string) {
  return { shareId };
}

export function parseCancelMessage(value: unknown): string | null {
  return isRecord(value) && typeof value.shareId === 'string' && SHARE_ID.test(value.shareId) ? value.shareId : null;
}

// ---------- Lista de conexões ----------

/** Um dispositivo para onde enviar: um navegador de uma conta, com as abas dele (`peerIds`). */
export type PeerDevice = {
  accountId: string;
  deviceId: string;
  deviceName: string;
  /** O e-mail do Jira, quando ele mostra; senão, o que o dispositivo disse. */
  email: string;
  peerIds: string[];
};

/** Uma pessoa (uma conta do Jira) com os dispositivos conectados dela. Nome e foto vêm do Jira. */
export type PeerPerson = {
  accountId: string;
  name: string;
  avatarUrl: string | null;
  /**
   * O e-mail do Jira, quando a privacidade do perfil deixa ele mostrar (e aí os
   * dispositivos precisam ter dito o mesmo); senão, o que os dispositivos disseram.
   */
  email: string;
  devices: PeerDevice[];
};

export type PeerGroups = {
  /** Os outros dispositivos da conta conectada (o mesmo accountId). */
  mine: PeerDevice[];
  /** As outras contas, pelo nome. */
  people: PeerPerson[];
};

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/**
 * Agrupa as conexões por conta do Jira (accountId) e, dentro dela, por
 * dispositivo: as abas de um navegador viram um dispositivo só, e o envio vai
 * para todas elas (a primeira que responder decide). Os meus outros dispositivos
 * (a mesma conta) ficam à parte.
 */
export function groupPeers(peers: Record<string, PeerEntry>, self: { accountId: string | null; deviceId: string }): PeerGroups {
  const byAccount = new Map<string, { account: VerifiedAccount; emails: Set<string>; devices: Map<string, PeerDevice> }>();
  // Em ordem de id: nada troca de lugar a cada mudança na sala.
  for (const peerId of Object.keys(peers).sort()) {
    const { profile, account } = peers[peerId];
    // Outras abas deste navegador: os dashboards já são os mesmos.
    if (profile.deviceId === self.deviceId) continue;
    const person = byAccount.get(account.accountId) ?? { account, emails: new Set<string>(), devices: new Map() };
    person.emails.add(profile.email);
    const device = person.devices.get(profile.deviceId);
    if (device) device.peerIds.push(peerId);
    else {
      person.devices.set(profile.deviceId, {
        accountId: account.accountId,
        deviceId: profile.deviceId,
        deviceName: profile.deviceName,
        email: account.email ?? profile.email,
        peerIds: [peerId],
      });
    }
    byAccount.set(account.accountId, person);
  }

  const sortDevices = (devices: Map<string, PeerDevice>) =>
    [...devices.values()].sort((a, b) => collator.compare(a.deviceName, b.deviceName));

  const people: PeerPerson[] = [];
  for (const [accountId, { account, emails, devices }] of byAccount) {
    if (accountId === self.accountId) continue;
    const email = account.email ?? [...emails].sort().join(', ');
    people.push({ accountId, name: account.name, avatarUrl: account.avatarUrl, email, devices: sortDevices(devices) });
  }
  people.sort((a, b) => collator.compare(a.name, b.name) || a.accountId.localeCompare(b.accountId));

  const mine = self.accountId ? byAccount.get(self.accountId) : undefined;
  return { mine: mine ? sortDevices(mine.devices) : [], people };
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Pesquisa por nome, e-mail ou dispositivo, sem acento e sem diferenciar maiúsculas. */
export function matchesPerson(person: PeerPerson, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const haystack = normalize([person.name, person.email, ...person.devices.map((device) => device.deviceName)].join(' '));
  return words.every((word) => haystack.includes(word));
}
