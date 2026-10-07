import { joinRoom, type JsonValue } from '@trystero-p2p/nostr';
import {
  cancelMessage,
  MAX_SHARE_BYTES,
  parseCancelMessage,
  parseProfileMessage,
  parseShareRequest,
  parseShareResponse,
  type PeerEntry,
  type PeerProfile,
  profileMessage,
  SHARE_TIMEOUT_MS,
  type ShareOutcome,
  type ShareRequest,
  type ShareResponse,
} from './protocol';
import { PEER_APP_ID } from './room';
import type { RejectReason, Verification } from './verifyPeer';

/**
 * Teto do que um dispositivo pode receber de uma vez, somando todos os
 * dispositivos (o padrão do Trystero é 256 MiB): dois pedidos do maior tamanho aceito.
 */
const MAX_RECEIVE_BYTES = 2 * 1024 * 1024;

/** Perfis e cancelamentos têm poucas centenas de bytes. */
const MAX_SMALL_MESSAGE_BYTES = 8 * 1024;

/** Folga para a resposta chegar depois do prazo de quem recebe. */
const RESPONSE_GRACE_MS = 15_000;

/** O handshake inclui a consulta da conta no Jira (o padrão do Trystero é 10 s). */
const HANDSHAKE_TIMEOUT_MS = 20_000;

export interface PeerRoomHandlers {
  /** Um dispositivo com a conta conferida no Jira passou pelo handshake e entrou na sala. */
  onPeerJoin: (peerId: string, entry: PeerEntry) => void;
  /** O dispositivo mudou de nome. */
  onPeerUpdate: (peerId: string, entry: PeerEntry) => void;
  /** Um dispositivo ficou de fora porque a conta dele não passou na conferência do Jira. */
  onPeerRejected: (reason: RejectReason) => void;
  onPeerLeave: (peerId: string) => void;
  /** Um dashboard ou relatório chegou: a resposta é a decisão de quem recebe. */
  onShareRequest: (peerId: string, request: ShareRequest) => Promise<ShareResponse>;
  onShareCancel: (peerId: string, shareId: string) => void;
  /** Os dois lados trocaram a oferta pelo relay, mas a rede não deixou a conexão direta abrir. */
  onConnectionFailed: () => void;
}

export interface PeerRoomConnection {
  /** Envia um dashboard e espera a resposta (aceito, recusado, inválido…). */
  sendShare: (peerId: string, request: ShareRequest, signal: AbortSignal) => Promise<ShareOutcome>;
  cancelShare: (peerId: string, shareId: string) => void;
  /** Avisa os outros dispositivos de uma mudança no perfil (o nome do dispositivo). */
  updateProfile: (profile: PeerProfile) => void;
  leave: () => void;
}

interface JoinOptions {
  roomId: string;
  /** O perfil atual (o handshake de cada dispositivo novo manda o mais recente). */
  getProfile: () => PeerProfile;
  /** Confere no Jira a conta que o dispositivo diz ter. */
  verifyPeer: (profile: PeerProfile) => Promise<Verification>;
  handlers: PeerRoomHandlers;
}

function errorKind(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'kind' in error ? String((error as { kind: unknown }).kind) : undefined;
}

/**
 * Entra na sala por WebRTC (Trystero). Os relays Nostr públicos só servem para
 * os navegadores se acharem e trocarem a oferta de conexão; perfis e dashboards
 * vão direto entre eles, pelo DataChannel (cifrado de ponta a ponta).
 */
export function joinPeerRoom({ roomId, getProfile, verifyPeer, handlers }: JoinOptions): PeerRoomConnection {
  /** Dispositivos que passaram pelo handshake, com a conta conferida, pelo id do peer. */
  const entries = new Map<string, PeerEntry>();
  /** Recusados no handshake por nós: a falha deles não é problema de rede. */
  const refused = new Set<string>();

  const room = joinRoom(
    { appId: PEER_APP_ID, maxReceiveBytes: MAX_RECEIVE_BYTES, relayConfig: { warnOnRelayFailure: false } },
    roomId,
    {
      // Antes de entrar na lista, cada lado manda o perfil. Fica de fora quem é de outro
      // app, outra aba deste navegador ou tem uma conta que o Jira da empresa não confirma.
      onPeerHandshake: async (peerId, send, receive, isInitiator) => {
        if (isInitiator) await send(profileMessage(getProfile()));
        const { data } = await receive();
        const profile = parseProfileMessage(data);
        if (!profile || profile.deviceId === getProfile().deviceId) {
          refused.add(peerId);
          throw new Error('Dispositivo fora do protocolo.');
        }
        const verification = await verifyPeer(profile);
        if (!verification.ok) {
          // Um dispositivo que tenta de novo conta uma vez só.
          if (!refused.has(peerId)) handlers.onPeerRejected(verification.reason);
          refused.add(peerId);
          throw new Error('Conta não confirmada no Jira da empresa.');
        }
        if (!isInitiator) await send(profileMessage(getProfile()));
        entries.set(peerId, { profile, account: verification.account });
      },
      handshakeTimeoutMs: HANDSHAKE_TIMEOUT_MS,
      onJoinError: ({ peerId }) => {
        if (!refused.has(peerId)) handlers.onConnectionFailed();
      },
    },
  );

  const shareAction = room.makeAction<JsonValue, JsonValue>('team-dashboard-share', {
    kind: 'request',
    // Um pedido muito maior que um dashboard nem começa a ser transferido. O .json vai
    // escapado dentro do pedido (até o dobro); o limite exato é conferido ao receber.
    onReceive: ({ byteLength, kind }) => kind === 'response' || byteLength <= MAX_SHARE_BYTES * 2,
    onRequest: async (data, { peerId }) => {
      const request = parseShareRequest(data);
      if (!request) return { status: 'invalid', code: 'bad-request' };
      return handlers.onShareRequest(peerId, request);
    },
  });

  const cancelAction = room.makeAction<JsonValue>('team-dashboard-cancel', {
    onReceive: ({ byteLength }) => byteLength <= MAX_SMALL_MESSAGE_BYTES,
    onMessage: (data, { peerId }) => {
      const shareId = parseCancelMessage(data);
      if (shareId) handlers.onShareCancel(peerId, shareId);
    },
  });

  const profileAction = room.makeAction<JsonValue>('team-profile', {
    onReceive: ({ byteLength }) => byteLength <= MAX_SMALL_MESSAGE_BYTES,
    onMessage: (data, { peerId }) => {
      const known = entries.get(peerId);
      const profile = parseProfileMessage(data);
      // A identidade (e-mail, conta e dispositivo) é a do handshake; só o nome do dispositivo muda.
      const isSame =
        profile?.email === known?.profile.email &&
        profile?.accountId === known?.profile.accountId &&
        profile?.deviceId === known?.profile.deviceId;
      if (!known || !profile || !isSame) return;
      const entry = { ...known, profile };
      entries.set(peerId, entry);
      handlers.onPeerUpdate(peerId, entry);
    },
  });

  room.onPeerJoin = (peerId) => {
    const entry = entries.get(peerId);
    if (entry) handlers.onPeerJoin(peerId, entry);
  };
  room.onPeerLeave = (peerId) => {
    entries.delete(peerId);
    refused.delete(peerId);
    handlers.onPeerLeave(peerId);
  };

  function cancelShare(peerId: string, shareId: string) {
    void cancelAction.send(cancelMessage(shareId), { target: peerId }).catch(() => undefined);
  }

  return {
    sendShare: async (peerId, request, signal) => {
      try {
        const response = await shareAction.request(request, {
          target: peerId,
          timeoutMs: SHARE_TIMEOUT_MS + RESPONSE_GRACE_MS,
          signal,
        });
        return parseShareResponse(response) ?? { status: 'failed', reason: 'O outro dispositivo respondeu fora do formato esperado.' };
      } catch (error) {
        switch (errorKind(error)) {
          case 'aborted':
            cancelShare(peerId, request.shareId);
            return { status: 'cancelled' };
          case 'timeout':
            cancelShare(peerId, request.shareId);
            return { status: 'timeout' };
          case 'disconnected':
            return { status: 'disconnected' };
          case 'rejected':
            return { status: 'failed', reason: 'O outro dispositivo recusou o arquivo antes de recebê-lo.' };
          default:
            return { status: 'failed', reason: 'A conexão caiu no meio do envio.' };
        }
      }
    },
    cancelShare,
    updateProfile: (profile) => {
      if (entries.size > 0) void profileAction.send(profileMessage(profile)).catch(() => undefined);
    },
    leave: () => {
      room.onPeerJoin = null;
      room.onPeerLeave = null;
      void room.leave();
    },
  };
}
