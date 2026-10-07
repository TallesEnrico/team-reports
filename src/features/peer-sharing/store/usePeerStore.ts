import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ImportedDashboard } from '../../builder/lib/transfer';
import type { SharedReport } from '../../team-reports/lib/shareLink';
import type { PeerRoomConnection } from '../lib/peerRoom';
import {
  DEVICE_NAME_MAX,
  type InvalidCode,
  MAX_REPORT_SHARE_BYTES,
  MAX_SHARE_BYTES,
  type PeerDevice,
  type PeerEntry,
  reportShareRequest,
  SHARE_TIMEOUT_MS,
  type ShareOutcome,
  shareRequest,
  type ShareRequest,
  type ShareResponse,
} from '../lib/protocol';
import { readReportShare } from '../lib/reportShare';
import type { RejectReason } from '../lib/verifyPeer';

/**
 * - `off`: desligado em Configurações, ou sem conta do Jira conectada;
 * - `unsupported`: o navegador não tem WebRTC;
 * - `connecting`: carregando a conexão;
 * - `online`: na sala, procurando e recebendo os outros dispositivos;
 * - `no-account`: o Jira não respondeu quem é a conta conectada (sem ela, ninguém aceitaria este dispositivo);
 * - `cannot-verify`: a conta conectada não pode consultar pessoas no Jira, então não confere ninguém;
 * - `error`: não deu para entrar na sala (ex: o módulo não carregou).
 */
export type PeerStatus = 'off' | 'unsupported' | 'connecting' | 'online' | 'no-account' | 'cannot-verify' | 'error';

interface IncomingBase {
  /** `peerId:shareId`: um envio é sempre de quem o mandou. */
  key: string;
  peerId: string;
  /** Quem enviou: o dispositivo e a conta conferida no Jira. */
  from: PeerEntry;
  /**
   * - `pending`: esperando "Aceitar" ou "Recusar";
   * - `cancelled`: quem enviou desistiu;
   * - `expired`: o tempo para responder acabou.
   */
  state: 'pending' | 'cancelled' | 'expired';
}

/** Um dashboard ou o recorte de um relatório que chegou de outro dispositivo, já validado. */
export type IncomingShare =
  | (IncomingBase & {
      kind: 'dashboard';
      /** O dashboard validado (só em `pending`). */
      dashboard: ImportedDashboard | null;
      /** Blocos do dashboard (as peças de "Mostrar"). */
      blocks: number;
      /** Peças de dados: cada uma é uma busca no Jira, com a conta de quem aceitar. */
      sources: number;
      /** O período do dashboard ("Este mês"). */
      period: string;
    })
  | (IncomingBase & {
      kind: 'report';
      /** O recorte validado (só em `pending`). As horas não vêm: quem aceita busca com a própria conta. */
      report: SharedReport | null;
    });

/** Identifica o envio do relatório na lista de respostas (um por dispositivo). */
export const REPORT_SHARE_ITEM = 'team-report';

export type OutgoingStatus = 'waiting' | ShareOutcome['status'];

/** Conta de quem foi recusada ao receber: não envia de novo até ser liberada em Configurações. */
export interface BlockedSender {
  accountId: string;
  name: string;
  email: string | null;
}

/** O último envio de um dashboard para um dispositivo. */
export interface OutgoingShare {
  shareId: string;
  status: OutgoingStatus;
  /** Motivo de `invalid`. */
  code?: InvalidCode;
  /** Motivo de `failed` (texto deste navegador, nunca do outro). */
  reason?: string;
}

interface PeerState {
  /** Aparecer para as conexões e receber dashboards (Configurações). Salvo neste navegador. */
  enabled: boolean;
  /** Nome deste dispositivo para os outros; `null` = o automático ("tallessoares - Chrome no macOS"). */
  deviceName: string | null;
  /** Tocar um som quando chega um envio (Configurações → Conta). Salvo neste navegador. */
  soundEnabled: boolean;
  status: PeerStatus;
  roomId: string | null;
  /** A conta do Jira deste navegador na sala. */
  accountId: string | null;
  /** Dispositivos conectados, com a conta conferida, pelo id do peer (uma aba). */
  peers: Record<string, PeerEntry>;
  /** Conexões que não abriram nesta sessão (rede que bloqueia conexão direta). */
  failedConnections: number;
  /** Dispositivos recusados nesta sessão porque a conta não passou na conferência do Jira, por motivo. */
  rejectedPeers: Partial<Record<RejectReason, number>>;
  /** Contas bloqueadas em "Bloquear usuário". Salvo neste navegador, até liberar em Configurações. */
  blockedSenders: BlockedSender[];
  /** Fila do que chegou: um diálogo de cada vez, o primeiro da fila. */
  incoming: IncomingShare[];
  /** Envios por dashboard e dispositivo (`outgoingKey`). Só nesta sessão. */
  outgoing: Record<string, OutgoingShare>;

  setEnabled: (enabled: boolean) => void;
  setDeviceName: (name: string | null) => void;
  setSoundEnabled: (enabled: boolean) => void;

  // Usadas pela conexão (usePeerConnection).
  attach: (connection: PeerRoomConnection | null, status: PeerStatus, roomId: string | null, accountId?: string | null) => void;
  addPeer: (peerId: string, entry: PeerEntry) => void;
  removePeer: (peerId: string) => void;
  countFailure: () => void;
  countRejection: (reason: RejectReason) => void;
  receiveShare: (peerId: string, request: ShareRequest) => Promise<ShareResponse>;
  cancelIncoming: (peerId: string, shareId: string) => void;

  /** "Aceitar" ou "Recusar": responde a quem enviou e tira o pedido da fila (também das outras abas). Recusar vale só para este envio. */
  respondIncoming: (key: string, response: ShareResponse) => void;
  /** "Bloquear usuário": recusa este envio e impede a conta de enviar de novo, até liberar em Configurações. */
  blockSender: (key: string) => void;
  /** Tira uma conta da lista de bloqueadas: ela volta a poder enviar. */
  releaseSender: (accountId: string) => void;
  /** Fecha um aviso da fila que já não espera resposta (cancelado, vencido). */
  dismissIncoming: (key: string) => void;
  /** Envia um dashboard (o .json do "Exportar") para um dispositivo e acompanha a resposta. */
  shareDashboard: (dashboardId: string, device: PeerDevice, file: string) => Promise<void>;
  /** Envia o recorte do relatório (a query do link) para um dispositivo e acompanha a resposta. */
  shareReport: (device: PeerDevice, search: string) => Promise<void>;
  cancelOutgoing: (dashboardId: string, device: PeerDevice) => void;
}

/** Quantos pedidos esperam (ou estão sendo validados) na fila de quem recebe. */
const MAX_QUEUE = 5;
/** Quantos pedidos entram por minuto, de todos os dispositivos: o resto é "ocupado". */
const MAX_PER_MINUTE = 6;
/** Depois de uma recusa (ou de um pedido inválido), quanto tempo a mesma conta espera para enviar de novo. */
const COOLDOWN_MS = 20_000;

/** O envio de um dashboard para um dispositivo de uma conta. */
export function outgoingKey(dashboardId: string, device: Pick<PeerDevice, 'accountId' | 'deviceId'>): string {
  return `${dashboardId}|${device.accountId}|${device.deviceId}`;
}

// Fora do estado: objetos vivos da conexão e controles dos limites, não dados da tela.
let connection: PeerRoomConnection | null = null;
/** Quem enviou espera esta resposta, pela chave do envio (`peerId:shareId`). */
const responders = new Map<string, (response: ShareResponse) => void>();
const expiryTimers = new Map<string, number>();
const controllers = new Map<string, AbortController>();
/** Um pedido de cada vez por aba de quem envia. */
const busyPeers = new Set<string>();
/** Até quando cada conta (accountId) espera depois de uma recusa. */
const cooldowns = new Map<string, number>();
/** Quando chegaram os pedidos do último minuto. */
let arrivals: number[] = [];
/** Pedidos sendo validados agora (contam na fila). */
let validating = 0;

/** As abas deste navegador recebem o mesmo envio; quando uma responde, as outras fecham o pedido. */
const tabs = typeof BroadcastChannel === 'function' ? new BroadcastChannel('team-report:peer-sharing') : null;

type Validation =
  | { ok: true; kind: 'dashboard'; dashboard: ImportedDashboard; blocks: number; sources: number; period: string }
  | { ok: true; kind: 'report'; report: SharedReport }
  | { ok: false; code: InvalidCode };

/**
 * A mesma validação do "Importar": o arquivo pode vir de qualquer um na sala.
 * O editor fica fora do pacote inicial; a validação vem com ele, sob demanda.
 */
async function validateDashboard(file: string): Promise<Validation> {
  if (file.length > MAX_SHARE_BYTES) return { ok: false, code: 'too-large' };
  const [{ parseDashboardFile, blockCount, sourceCount }, { periodLabel }] = await Promise.all([
    import('../../builder/lib/transfer'),
    import('../../builder/lib/periods'),
  ]);
  const parsed = parseDashboardFile(file);
  if (!parsed.ok) return { ok: false, code: parsed.code };
  const { dashboard } = parsed;
  return {
    ok: true,
    kind: 'dashboard',
    dashboard,
    blocks: blockCount(dashboard),
    sources: sourceCount(dashboard),
    period: periodLabel(dashboard.period),
  };
}

function validateReport(search: string): Validation {
  if (search.length > MAX_REPORT_SHARE_BYTES) return { ok: false, code: 'report-too-large' };
  const report = readReportShare(search);
  return report ? { ok: true, kind: 'report', report } : { ok: false, code: 'not-report' };
}

/** Uma vaga entre os pedidos do último minuto. */
function takeArrivalSlot(now: number): boolean {
  arrivals = arrivals.filter((time) => now - time < 60_000);
  if (arrivals.length >= MAX_PER_MINUTE) return false;
  arrivals.push(now);
  return true;
}

function settle(key: string, response: ShareResponse) {
  window.clearTimeout(expiryTimers.get(key));
  expiryTimers.delete(key);
  responders.get(key)?.(response);
  responders.delete(key);
}

/** Respostas que decidem um envio; as outras (ocupado, sem conexão…) esperam as outras abas. */
const FINAL = new Set<OutgoingStatus>(['accepted', 'declined', 'invalid', 'expired']);
/** Entre respostas que não decidem, a que mais explica (cancelado por quem enviou vem primeiro). */
const RANK: OutgoingStatus[] = ['cancelled', 'busy', 'timeout', 'disconnected', 'failed'];

/** A primeira resposta que decide, entre as abas do dispositivo; sem nenhuma, a que mais explica. */
function firstFinal(requests: Promise<ShareOutcome>[]): Promise<ShareOutcome> {
  return new Promise((resolve) => {
    const others: ShareOutcome[] = [];
    for (const request of requests) {
      void request.then((outcome) => {
        if (FINAL.has(outcome.status)) resolve(outcome);
        else if (others.push(outcome) === requests.length) {
          resolve(others.sort((a, b) => RANK.indexOf(a.status) - RANK.indexOf(b.status))[0]);
        }
      });
    }
  });
}

/**
 * Conexões P2P entre dispositivos do mesmo Jira: quem está conectado, os
 * dashboards que chegaram e os enviados. A conexão em si fica no
 * `usePeerConnection`; aqui ficam o estado da tela e as ações.
 */
export const usePeerStore = create<PeerState>()(
  persist(
    (set, get) => {
      /** Tira um pedido da fila e libera a aba de quem o enviou. */
      function removeIncoming(key: string) {
        set((state) => {
          const item = state.incoming.find((share) => share.key === key);
          if (!item) return {};
          busyPeers.delete(item.peerId);
          return { incoming: state.incoming.filter((share) => share.key !== key) };
        });
      }

      function markIncoming(key: string, itemState: IncomingShare['state']) {
        set((state) => ({
          incoming: state.incoming.map((share) => {
            if (share.key !== key) return share;
            if (share.kind === 'report') return { ...share, state: itemState, report: null };
            return { ...share, state: itemState, dashboard: null };
          }),
        }));
      }

      async function sendToDevice(
        itemId: string,
        device: PeerDevice,
        createRequest: (shareId: string, from: string) => ShareRequest,
        blocked?: InvalidCode,
      ) {
        const from = get().accountId;
        if (!connection || !from || device.peerIds.length === 0) return;
        const key = outgoingKey(itemId, device);
        const shareId = crypto.randomUUID();
        if (blocked) {
          set((state) => ({ outgoing: { ...state.outgoing, [key]: { shareId, status: 'invalid', code: blocked } } }));
          return;
        }
        const controller = new AbortController();
        controllers.set(shareId, controller);
        set((state) => ({ outgoing: { ...state.outgoing, [key]: { shareId, status: 'waiting' } } }));

        const request = createRequest(shareId, from);
        const target = connection;
        const outcome = await firstFinal(device.peerIds.map((peerId) => target.sendShare(peerId, request, controller.signal)));
        controller.abort();
        controllers.delete(shareId);
        set((state) => {
          if (state.outgoing[key]?.shareId !== shareId) return {};
          if (outcome.status === 'cancelled') {
            const { [key]: _, ...outgoing } = state.outgoing;
            return { outgoing };
          }
          const item: OutgoingShare = { shareId, status: outcome.status };
          if (outcome.status === 'invalid') item.code = outcome.code;
          if (outcome.status === 'failed') item.reason = outcome.reason;
          return { outgoing: { ...state.outgoing, [key]: item } };
        });
      }

      // Outra aba deste navegador respondeu: o pedido some daqui sem decidir nada.
      tabs?.addEventListener('message', (event: MessageEvent<unknown>) => {
        const data = event.data as { answered?: unknown } | null;
        if (typeof data?.answered !== 'string' || !responders.has(data.answered)) return;
        settle(data.answered, { status: 'busy' });
        removeIncoming(data.answered);
      });

      return {
        enabled: true,
        deviceName: null,
        soundEnabled: true,
        status: 'off',
        roomId: null,
        accountId: null,
        peers: {},
        failedConnections: 0,
        rejectedPeers: {},
        blockedSenders: [],
        incoming: [],
        outgoing: {},

        setEnabled: (enabled) => set({ enabled }),
        setDeviceName: (name) => set({ deviceName: name?.trim().slice(0, DEVICE_NAME_MAX) || null }),
        setSoundEnabled: (soundEnabled) => set({ soundEnabled }),

        attach: (next, status, roomId, accountId = null) => {
          connection = next;
          // Saindo da sala, os dispositivos de antes não estão mais ao alcance.
          set(
            next
              ? { status, roomId, accountId }
              : { status, roomId, accountId, peers: {}, failedConnections: 0, rejectedPeers: {} },
          );
        },
        addPeer: (peerId, entry) => set((state) => ({ peers: { ...state.peers, [peerId]: entry } })),
        removePeer: (peerId) =>
          set((state) => {
            if (!(peerId in state.peers)) return {};
            const { [peerId]: _, ...peers } = state.peers;
            return { peers };
          }),
        countFailure: () => set((state) => ({ failedConnections: state.failedConnections + 1 })),
        countRejection: (reason) =>
          set((state) => ({ rejectedPeers: { ...state.rejectedPeers, [reason]: (state.rejectedPeers[reason] ?? 0) + 1 } })),

        receiveShare: async (peerId, request) => {
          const from = get().peers[peerId];
          if (!from) return { status: 'declined' };
          const senderId = from.account.accountId;
          if (get().blockedSenders.some((sender) => sender.accountId === senderId)) return { status: 'declined' };
          const key = `${peerId}:${request.shareId}`;
          const now = Date.now();
          const isLimited =
            responders.has(key) ||
            busyPeers.has(peerId) ||
            (cooldowns.get(senderId) ?? 0) > now ||
            get().incoming.length + validating >= MAX_QUEUE;
          if (isLimited || !takeArrivalSlot(now)) return { status: 'busy' };

          // O pedido diz de que conta vem e para qual vai: de quem passou na conferência, para esta conta.
          const recipient = request.to !== get().accountId ? 'wrong-recipient' : request.from !== senderId ? 'bad-request' : null;
          if (recipient) {
            cooldowns.set(senderId, now + COOLDOWN_MS);
            return { status: 'invalid', code: recipient };
          }
          busyPeers.add(peerId);

          let result: Validation;
          validating++;
          try {
            result = request.type === 'team-report' ? validateReport(request.search) : await validateDashboard(request.file);
          } catch {
            result = { ok: false, code: 'unavailable' };
          } finally {
            validating--;
          }

          // Inválido: só quem enviou fica sabendo (com o motivo); nada aparece na tela de quem recebe.
          if (!result.ok) {
            busyPeers.delete(peerId);
            if (result.code !== 'unavailable') cooldowns.set(senderId, Date.now() + COOLDOWN_MS);
            return { status: 'invalid', code: result.code };
          }

          const item: IncomingShare =
            result.kind === 'report'
              ? { kind: 'report', key, peerId, from, state: 'pending', report: result.report }
              : {
                  kind: 'dashboard',
                  key,
                  peerId,
                  from,
                  state: 'pending',
                  dashboard: result.dashboard,
                  blocks: result.blocks,
                  sources: result.sources,
                  period: result.period,
                };
          return new Promise<ShareResponse>((resolve) => {
            responders.set(key, resolve);
            expiryTimers.set(
              key,
              window.setTimeout(() => {
                settle(key, { status: 'expired' });
                markIncoming(key, 'expired');
              }, SHARE_TIMEOUT_MS),
            );
            set((state) => ({ incoming: [...state.incoming, item] }));
          });
        },

        cancelIncoming: (peerId, shareId) => {
          const key = `${peerId}:${shareId}`;
          if (!responders.has(key)) return;
          settle(key, { status: 'declined' });
          markIncoming(key, 'cancelled');
        },

        respondIncoming: (key, response) => {
          const item = get().incoming.find((share) => share.key === key);
          if (item && response.status === 'declined') cooldowns.set(item.from.account.accountId, Date.now() + COOLDOWN_MS);
          settle(key, response);
          tabs?.postMessage({ answered: key });
          removeIncoming(key);
        },
        blockSender: (key) => {
          const item = get().incoming.find((share) => share.key === key);
          if (!item) return;
          const account = item.from.account;
          set((state) => ({
            blockedSenders: [
              { accountId: account.accountId, name: account.name, email: account.email },
              ...state.blockedSenders.filter((sender) => sender.accountId !== account.accountId),
            ],
          }));
          for (const share of get().incoming.filter((share) => share.from.account.accountId === account.accountId)) {
            if (!responders.has(share.key)) {
              removeIncoming(share.key);
              continue;
            }
            cooldowns.set(account.accountId, Date.now() + COOLDOWN_MS);
            settle(share.key, { status: 'declined' });
            tabs?.postMessage({ answered: share.key });
            removeIncoming(share.key);
          }
        },
        releaseSender: (accountId) =>
          set((state) => ({ blockedSenders: state.blockedSenders.filter((sender) => sender.accountId !== accountId) })),
        dismissIncoming: removeIncoming,

        shareDashboard: (dashboardId, device, file) =>
          sendToDevice(
            dashboardId,
            device,
            (shareId, from) => shareRequest(shareId, from, device.accountId, file),
            file.length > MAX_SHARE_BYTES ? 'too-large' : undefined,
          ),
        shareReport: (device, search) =>
          sendToDevice(
            REPORT_SHARE_ITEM,
            device,
            (shareId, from) => reportShareRequest(shareId, from, device.accountId, search),
            search.length > MAX_REPORT_SHARE_BYTES ? 'report-too-large' : undefined,
          ),
        cancelOutgoing: (dashboardId, device) => {
          const item = get().outgoing[outgoingKey(dashboardId, device)];
          if (item?.status === 'waiting') controllers.get(item.shareId)?.abort();
        },
      };
    },
    {
      name: 'team-report:peer-sharing',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        enabled: state.enabled,
        deviceName: state.deviceName,
        soundEnabled: state.soundEnabled,
        blockedSenders: state.blockedSenders,
      }),
    },
  ),
);

// "Ligar" e "Desligar" (e o nome do dispositivo) valem para todas as abas deste navegador.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === 'team-report:peer-sharing') void usePeerStore.persist.rehydrate();
  });
}
