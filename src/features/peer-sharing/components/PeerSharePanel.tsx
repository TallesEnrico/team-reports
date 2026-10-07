import { DeviceMobile, DeviceTablet, Laptop, MagnifyingGlass, PaperPlaneTilt, SealCheck } from '@phosphor-icons/react';
import { useId, useMemo, useState } from 'react';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { Notice } from '../../../components/Notice';
import { cx } from '../../../lib/cx';
import { getDeviceId } from '../lib/device';
import { groupPeers, INVALID_MESSAGES, matchesPerson, type PeerDevice } from '../lib/protocol';
import { rejectionSummary } from '../lib/verifyPeer';
import { type OutgoingShare, outgoingKey, usePeerStore } from '../store/usePeerStore';
import styles from './PeerSharePanel.module.css';

interface PeerSharePanelProps {
  /** O que está sendo enviado: as respostas ficam guardadas por este id e pelo dispositivo. */
  itemId: string;
  onSend: (device: PeerDevice) => void;
}

/** A partir de quantas pessoas aparece a pesquisa. */
const SEARCH_FROM = 6;

/**
 * "Pelas conexões": os dispositivos na sala, já com a conta conferida no Jira
 * (os meus primeiro, depois cada conta com os dela), e o envio para um deles,
 * com a resposta.
 */
export function PeerSharePanel({ itemId, onSend }: PeerSharePanelProps) {
  const searchId = useId();
  const status = usePeerStore((state) => state.status);
  const enabled = usePeerStore((state) => state.enabled);
  const setEnabled = usePeerStore((state) => state.setEnabled);
  const peers = usePeerStore((state) => state.peers);
  const failedConnections = usePeerStore((state) => state.failedConnections);
  const rejectedPeers = usePeerStore((state) => state.rejectedPeers);
  const accountId = usePeerStore((state) => state.accountId);
  const deviceId = useMemo(getDeviceId, []);
  const groups = useMemo(() => groupPeers(peers, { accountId, deviceId }), [peers, accountId, deviceId]);
  const [query, setQuery] = useState('');
  const people = query.trim() ? groups.people.filter((person) => matchesPerson(person, query)) : groups.people;

  if (!enabled) {
    return (
      <div className={styles.off}>
        <p className={styles.text}>
          As conexões estão desligadas neste navegador: ninguém vê você, e você não vê ninguém.
        </p>
        <Button variant="secondary" onClick={() => setEnabled(true)}>
          Ligar as conexões
        </Button>
      </div>
    );
  }
  if (status === 'unsupported') {
    return <Notice tone="warning">Este navegador não tem WebRTC, que as conexões usam. Use o link ou o arquivo.</Notice>;
  }
  if (status === 'error') {
    return <Notice tone="error">Não foi possível entrar na sala das conexões. Recarregue a página e tente de novo.</Notice>;
  }
  if (status === 'no-account') {
    return (
      <Notice tone="warning">
        O Jira não respondeu qual é a sua conta, e cada dispositivo é conferido pela conta. Recarregue a página e tente de novo.
      </Notice>
    );
  }
  if (status === 'cannot-verify') {
    return (
      <Notice tone="warning">
        A sua conta não pode consultar pessoas no Jira (permissão “Navegar por usuários e grupos”), então não dá para conferir quem
        está na sala. Peça a permissão a quem administra o Jira, ou use o link.
      </Notice>
    );
  }
  if (status === 'off') {
    return <p className={styles.text}>Conecte a sua conta do Jira para entrar na sala das conexões.</p>;
  }

  const isEmpty = groups.mine.length === 0 && groups.people.length === 0;

  return (
    <div className={styles.panel}>
      <p className={styles.status} role="status">
        <span className={cx(styles.dot, status === 'online' && styles.online)} aria-hidden />
        {status === 'online' ? (
          <>
            Na sala
          </>
        ) : (
          'Entrando na sala…'
        )}
      </p>

      {status === 'online' && isEmpty && (
        <p className={styles.empty}>
          Ninguém mais conectado agora. Aparece aqui quem está com o Team Reports aberto no mesmo Jira, com qualquer e-mail,
          inclusive você em outro dispositivo. Achar os outros leva alguns segundos.
        </p>
      )}

      {groups.mine.length > 0 && (
        <section className={styles.group} aria-label="Meus dispositivos">
          <h4 className={styles.groupHeading}>Meus dispositivos</h4>
          <ul className={styles.devices}>
            {groups.mine.map((device, index) => (
              <DeviceRow key={device.deviceId} device={device} itemId={itemId} onSend={onSend} showEmail index={index} />
            ))}
          </ul>
        </section>
      )}

      {groups.people.length > 0 && (
        <section className={styles.group} aria-label="Pessoas">
          <h4 className={styles.groupHeading}>
            Pessoas <span className={styles.count}>{groups.people.length}</span>
          </h4>
          {groups.people.length > SEARCH_FROM && (
            <div className={styles.search}>
              <MagnifyingGlass size={14} weight="bold" className={styles.searchIcon} aria-hidden />
              <label htmlFor={searchId} className="sr-only">
                Pesquisar pessoas
              </label>
              <input
                id={searchId}
                className={cx('input', styles.searchInput)}
                type="search"
                placeholder="Pesquisar por nome, e-mail ou dispositivo"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          )}
          {people.length > 0 ? (
            <ul className={styles.people}>
              {people.map((person) => (
                <li key={person.accountId} className={styles.person}>
                  <div className={styles.personHead}>
                    <Avatar src={person.avatarUrl ?? undefined} name={person.name} size={28} />
                    <span className={styles.personText}>
                      {/* Nome e foto são os do Jira para a conta, não os que o dispositivo diz. */}
                      <span className={styles.personName}>
                        {person.name}
                        <SealCheck size={13} weight="bold" className={styles.verified} role="img" aria-label="Conta conferida no Jira">
                          <title>Conta conferida no Jira</title>
                        </SealCheck>
                      </span>
                      <span className={styles.personEmail}>{person.email}</span>
                    </span>
                  </div>
                  <ul className={styles.devices}>
                    {person.devices.map((device, index) => (
                      <DeviceRow key={device.deviceId} device={device} itemId={itemId} onSend={onSend} index={index} />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>Ninguém conectado com esse nome.</p>
          )}
        </section>
      )}

      {rejectionSummary(rejectedPeers).map((line) => (
        <p key={line} className={styles.hint}>
          {line}
        </p>
      ))}

      {failedConnections > 0 && (
        <p className={styles.hint}>
          {failedConnections === 1 ? '1 conexão não abriu' : `${failedConnections} conexões não abriram`}: a rede de um dos lados
          bloqueia a conexão direta entre navegadores. Nesse caso, use o link ou o arquivo.
        </p>
      )}
    </div>
  );
}

function DeviceIcon({ name }: { name: string }) {
  const Icon = /iPhone|Android/i.test(name) ? DeviceMobile : /iPad/i.test(name) ? DeviceTablet : Laptop;
  return <Icon size={15} weight="bold" className={styles.deviceIcon} aria-hidden />;
}

/** Como o último envio para o dispositivo terminou (ou se ainda espera). */
function outgoingText(item: OutgoingShare): { tone: 'muted' | 'success' | 'warning' | 'error'; text: string } {
  switch (item.status) {
    case 'waiting':
      return { tone: 'muted', text: 'Esperando a resposta…' };
    case 'accepted':
      return { tone: 'success', text: 'Aceitou e abriu' };
    case 'declined':
      return { tone: 'warning', text: 'Recusou' };
    case 'invalid':
      return { tone: 'error', text: `Não aceito: ${INVALID_MESSAGES[item.code ?? 'bad-request']}` };
    case 'busy':
      return { tone: 'warning', text: 'Ocupado agora; tente de novo em alguns segundos' };
    case 'expired':
    case 'timeout':
      return { tone: 'warning', text: 'Sem resposta a tempo' };
    case 'disconnected':
      return { tone: 'warning', text: 'Desconectou antes de responder' };
    case 'cancelled':
      return { tone: 'muted', text: 'Envio cancelado' };
    case 'failed':
      return { tone: 'error', text: item.reason ?? 'O envio falhou' };
  }
}

interface DeviceRowProps {
  device: PeerDevice;
  itemId: string;
  onSend: (device: PeerDevice) => void;
  /** O e-mail embaixo do nome do dispositivo (em "Meus dispositivos"; nas pessoas, ele já fica sob o nome delas). */
  showEmail?: boolean;
  index: number;
}

function DeviceRow({ device, itemId, onSend, showEmail = false, index }: DeviceRowProps) {
  const outgoing = usePeerStore((state) => state.outgoing[outgoingKey(itemId, device)]);
  const cancelOutgoing = usePeerStore((state) => state.cancelOutgoing);
  const feedback = outgoing ? outgoingText(outgoing) : null;
  const isWaiting = outgoing?.status === 'waiting';
  const bgColor = index % 2 === 0 ? 'bg-tint' : 'bg-tint-2';

  return (
    <li className={`${styles.device} ${bgColor}`}>
      <DeviceIcon name={device.deviceName} />
      <span className={styles.deviceText}>
        <span className={styles.deviceName}>{device.deviceName}</span>
        {showEmail && <span className={styles.deviceEmail}>{device.email}</span>}
        <span className={cx(styles.feedback, feedback && styles[feedback.tone])} aria-live="polite">
          {feedback?.text}
        </span>
      </span>
      {isWaiting ? (
        <Button variant="ghost" className={styles.deviceAction} onClick={() => cancelOutgoing(itemId, device)}>
          Cancelar
        </Button>
      ) : (
        <Button
          variant="secondary"
          className={styles.deviceAction}
          icon={<PaperPlaneTilt size={14} weight="bold" aria-hidden />}
          aria-label={`${outgoing ? 'Enviar de novo' : 'Enviar'} para ${device.deviceName}`}
          onClick={() => onSend(device)}
        >
          {outgoing ? 'Enviar de novo' : 'Enviar'}
        </Button>
      )}
    </li>
  );
}
