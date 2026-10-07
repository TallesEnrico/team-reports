import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { fetchAccount, type JiraAccount } from '../../../api/jira-users';
import { jiraKeys } from '../../../api/queryKeys';
import { useCurrentUserQuery } from '../../../api/useCurrentUserQuery';
import { useJiraConnectionStore } from '../../../store/useJiraConnectionStore';
import { defaultDeviceName, getDeviceId } from '../lib/device';
import type { PeerRoomConnection } from '../lib/peerRoom';
import type { PeerProfile } from '../lib/protocol';
import { emailDomain, roomIdFor } from '../lib/room';
import { type AccountLookup, createPeerVerifier, lookupFailure } from '../lib/verifyPeer';
import { usePeerStore } from '../store/usePeerStore';

/** Quanto tempo a conta conferida de um dispositivo vale (quem entra de novo na sala não pede outra consulta). */
const ACCOUNT_CACHE_MS = 30 * 60_000;

/**
 * Mantém este navegador na sala das conexões (o Cloud ID do Jira) enquanto a
 * conta está conectada e as conexões estão ligadas em Configurações. Cada
 * dispositivo que chega tem a conta (accountId)
 * conferida no Jira da empresa antes de entrar na lista. Montado uma vez, no App.
 */
export function usePeerConnection(email: string): void {
  const queryClient = useQueryClient();
  const enabled = usePeerStore((state) => state.enabled);
  const customName = usePeerStore((state) => state.deviceName);
  const cloudId = useJiraConnectionStore((state) => state.credentials?.cloudId) ?? '';
  const currentUser = useCurrentUserQuery();
  const deviceId = useMemo(getDeviceId, []);
  const domain = emailDomain(email);
  const roomId = roomIdFor(cloudId);
  const accountId = currentUser.data?.accountId ?? null;
  const hasAccountError = currentUser.isError;

  const profile = useMemo<PeerProfile | null>(
    () =>
      accountId
        ? {
            email: email.trim().toLowerCase(),
            accountId,
            deviceId,
            deviceName: customName ?? defaultDeviceName(email, navigator.userAgent),
          }
        : null,
    [email, accountId, deviceId, customName],
  );

  const profileRef = useRef(profile);
  const connectionRef = useRef<PeerRoomConnection | null>(null);

  // Antes do efeito da sala: o handshake de cada dispositivo novo lê o perfil mais recente.
  useEffect(() => {
    profileRef.current = profile;
    if (profile) connectionRef.current?.updateProfile(profile);
  }, [profile]);

  // As contas conferidas ficam no cache do TanStack Query (inclusive as que não existem: `null`).
  const lookup = useMemo<AccountLookup>(
    () => ({
      cached: (id) => queryClient.getQueryData<JiraAccount | null>(jiraKeys.account(id)),
      fetch: (id) =>
        queryClient.fetchQuery({
          queryKey: jiraKeys.account(id),
          queryFn: ({ signal }) => fetchAccount(id, signal),
          staleTime: ACCOUNT_CACHE_MS,
          gcTime: ACCOUNT_CACHE_MS,
          retry: false,
        }),
    }),
    [queryClient],
  );

  useEffect(() => {
    const { attach, addPeer, removePeer, countFailure, countRejection, receiveShare, cancelIncoming } = usePeerStore.getState();
    if (!enabled || !domain || !roomId) {
      attach(null, 'off', null);
      return;
    }
    if (typeof RTCPeerConnection === 'undefined') {
      attach(null, 'unsupported', roomId);
      return;
    }
    // Sem a própria conta, nenhum dispositivo aceitaria este (a conta é conferida no Jira).
    if (hasAccountError) {
      attach(null, 'no-account', roomId);
      return;
    }
    if (!accountId) {
      attach(null, 'connecting', roomId);
      return;
    }

    let isCancelled = false;
    attach(null, 'connecting', roomId);
    // A própria conta é a primeira conferida: se nem ela aparece (403, ou 404 sem a
    // permissão de ver pessoas), nenhum outro dispositivo passaria.
    const ownAccount = lookup.fetch(accountId).then(
      (account) => (account ? null : ('cannot-verify' as const)),
      (error: unknown) => (lookupFailure(error) === 'forbidden' ? ('cannot-verify' as const) : ('error' as const)),
    );
    // O WebRTC (Trystero) fica fora do pacote inicial.
    Promise.all([import('../lib/peerRoom'), ownAccount])
      .then(([{ joinPeerRoom }, problem]) => {
        if (isCancelled) return;
        if (problem) {
          attach(null, problem, roomId);
          return;
        }
        connectionRef.current = joinPeerRoom({
          roomId,
          getProfile: () => profileRef.current!,
          verifyPeer: createPeerVerifier(lookup),
          handlers: {
            onPeerJoin: addPeer,
            onPeerUpdate: addPeer,
            onPeerLeave: removePeer,
            onPeerRejected: countRejection,
            onShareRequest: receiveShare,
            onShareCancel: cancelIncoming,
            onConnectionFailed: countFailure,
          },
        });
        attach(connectionRef.current, 'online', roomId, accountId);
      })
      .catch(() => {
        if (!isCancelled) attach(null, 'error', roomId);
      });

    return () => {
      isCancelled = true;
      connectionRef.current?.leave();
      connectionRef.current = null;
      attach(null, 'off', null);
    };
  }, [enabled, domain, roomId, accountId, hasAccountError, lookup]);
}
