import { Check, Copy } from '@phosphor-icons/react';
import { type FormEvent, useId, useMemo, useState } from 'react';
import { useCurrentUserQuery } from '../../../api/useCurrentUserQuery';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { FormField } from '../../../components/FormField';
import { useCopyToClipboard } from '../../../hooks/useCopyToClipboard';
import { cx } from '../../../lib/cx';
import { useJiraConnectionStore } from '../../../store/useJiraConnectionStore';
import { defaultDeviceName, getDeviceId } from '../../peer-sharing/lib/device';
import { DEVICE_NAME_MAX, groupPeers } from '../../peer-sharing/lib/protocol';
import { roomIdFor } from '../../peer-sharing/lib/room';
import { rejectionSummary } from '../../peer-sharing/lib/verifyPeer';
import { type PeerStatus, usePeerStore } from '../../peer-sharing/store/usePeerStore';
import styles from './PeerSharingSection.module.css';
import sectionStyles from './Section.module.css';

function statusText(status: PeerStatus, enabled: boolean): string {
  switch (status) {
    case 'online':
      return 'Na sala';
    case 'connecting':
      return 'Entrando na sala…';
    case 'unsupported':
      return 'Este navegador não tem WebRTC, que as conexões usam.';
    case 'error':
      return 'Não foi possível entrar na sala. Recarregue a página e tente de novo.';
    case 'no-account':
      return 'Fora da sala: o Jira não respondeu qual é a sua conta. Recarregue a página e tente de novo.';
    case 'cannot-verify':
      return 'Fora da sala: a sua conta não pode consultar pessoas no Jira (permissão “Navegar por usuários e grupos”), então não dá para conferir quem entra.';
    case 'off':
      return enabled ? 'Fora da sala: conecte a sua conta do Jira.' : 'Desligado: ninguém vê este navegador, e ele não recebe envios.';
  }
}

/**
 * "Conexões entre dispositivos": aparecer (ou não) para os outros navegadores
 * do mesmo Jira, que recebem e enviam dashboards (Dashboard › Compartilhar)
 * e relatórios (Reports › Compartilhar), o id da sala, quem foi bloqueado ao
 * receber e o nome deste dispositivo na lista deles.
 */
export function PeerSharingSection() {
  const headingId = useId();
  const nameId = useId();
  const enabled = usePeerStore((state) => state.enabled);
  const setEnabled = usePeerStore((state) => state.setEnabled);
  const deviceName = usePeerStore((state) => state.deviceName);
  const setDeviceName = usePeerStore((state) => state.setDeviceName);
  const status = usePeerStore((state) => state.status);
  const peers = usePeerStore((state) => state.peers);
  const failedConnections = usePeerStore((state) => state.failedConnections);
  const rejectedPeers = usePeerStore((state) => state.rejectedPeers);
  const blockedSenders = usePeerStore((state) => state.blockedSenders);
  const releaseSender = usePeerStore((state) => state.releaseSender);
  const accountId = usePeerStore((state) => state.accountId);
  const email = useJiraConnectionStore((state) => state.credentials?.email) ?? '';
  const cloudId = useJiraConnectionStore((state) => state.credentials?.cloudId) ?? '';
  const me = useCurrentUserQuery().data;
  const roomId = roomIdFor(cloudId);
  const deviceId = useMemo(getDeviceId, []);
  const autoName = defaultDeviceName(email, navigator.userAgent);
  const [draft, setDraft] = useState(deviceName ?? '');
  const { copy, copied } = useCopyToClipboard();
  const [copyFailed, setCopyFailed] = useState(false);

  const groups = useMemo(() => groupPeers(peers, { accountId, deviceId }), [peers, accountId, deviceId]);
  const connectedPeople = useMemo(() => {
    const list: { key: string; name: string; email: string; avatarUrl: string | null }[] = [];
    if (groups.mine.length > 0) {
      list.push({
        key: `self:${accountId ?? deviceId}`,
        name: me?.displayName ?? 'Você',
        email,
        avatarUrl: me?.avatarUrl ?? null,
      });
    }
    for (const person of groups.people) {
      list.push({
        key: person.accountId,
        name: person.name,
        email: person.email,
        avatarUrl: person.avatarUrl,
      });
    }
    return list;
  }, [groups, accountId, deviceId, me?.displayName, me?.avatarUrl, email]);

  function saveName(event?: FormEvent) {
    event?.preventDefault();
    setDeviceName(draft);
  }

  return (
    <section className={sectionStyles.section} aria-labelledby={headingId}>
      <div className={sectionStyles.head}>
        <h2 id={headingId} className={sectionStyles.heading}>
          Conexões entre dispositivos
        </h2>
        <p className={sectionStyles.description}>
          Para mandar um dashboard (Dashboard › Compartilhar) ou o recorte de um relatório (Reports › Compartilhar) direto de um
          navegador a outro, sem servidor nosso. Quem está com o Team Reports aberto no mesmo Cloud ID entra na mesma sala, em qualquer
          endereço e com qualquer e-mail: os seus outros dispositivos e as outras pessoas.
          Relays públicos da rede Nostr só apresentam um navegador ao outro; o envio vai direto entre eles, cifrado.
        </p>
      </div>
      <div className={sectionStyles.card}>
        <label className={styles.toggle}>
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          <span>Aparecer para as conexões e receber envios neste navegador</span>
        </label>
        <div className={styles.room}>
          <span className={styles.roomLabel}>Id da sala</span>
          {roomId ? (
            <div className={styles.roomRow}>
              <code className={styles.roomId}>{roomId}</code>
              <Button
                variant="ghost"
                className={sectionStyles.shareAction}
                icon={copied ? <Check size={14} weight="bold" aria-hidden /> : <Copy size={14} weight="bold" aria-hidden />}
                onClick={() => void copy(roomId).then((ok) => setCopyFailed(!ok))}
              >
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
          ) : (
            <p className={styles.roomEmpty}>Conecte a sua conta do Jira para ver o id da sala.</p>
          )}
          {copyFailed && <p className={sectionStyles.shareFailed}>O navegador não deixou copiar: selecione o id e copie.</p>}
        </div>

        <p className={styles.status} role="status">
          <span className={cx(styles.dot, status === 'online' && styles.online)} aria-hidden />
          {statusText(status, enabled)}
          {status === 'online' && ' · '}
          {status === 'online' && connectedPeople.length === 0 && 'nenhuma outra pessoa agora'}
          {status === 'online' && connectedPeople.length > 0 && (
            <span className={styles.people} tabIndex={0}>
              <span className={styles.peopleCount}>
                {connectedPeople.length === 1 ? '1 pessoa conectada' : `${connectedPeople.length} pessoas conectadas`}
              </span>
              <ul className={styles.peopleMenu} aria-label="Pessoas conectadas">
                {connectedPeople.map((person) => (
                  <li key={person.key} className={styles.person}>
                    <Avatar src={person.avatarUrl ?? undefined} name={person.name} size={32} />
                    <span className={styles.personText}>
                      <span className={styles.personName}>{person.name}</span>
                      {person.email && <span className={styles.personEmail}>{person.email}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </span>
          )}
        </p>

        <form onSubmit={saveName}>
          <FormField
            label="Nome deste dispositivo"
            htmlFor={nameId}
            hint={`Como os outros veem este navegador na lista. Vazio: “${autoName}”.`}
          >
            <input
              id={nameId}
              className={cx('input', styles.name)}
              value={draft}
              placeholder={autoName}
              maxLength={DEVICE_NAME_MAX}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => saveName()}
            />
          </FormField>
        </form>

        <p className={sectionStyles.cardText}>
          Cada dispositivo diz qual é a conta dele no Jira (o accountId), e o app confere no Jira da empresa, com a sua conta, antes de
          mostrá-lo: conta que não existe, desativada ou que não é de pessoa fica de fora, e nome, foto e e-mail na lista são os do
          Jira. Isso confirma que a conta existe, não que o dispositivo é mesmo dela: por isso todo envio pede a sua confirmação, e
          só vai a montagem do dashboard ou os filtros do relatório. As horas e os números do Jira não vão: quem aceita busca com a
          própria conta.
        </p>
        <p className={sectionStyles.cardText}>
          Quem está na sala vê o seu e-mail, a sua conta do Jira e o nome deste dispositivo. Os dispositivos conectados e os relays
          veem o endereço IP deste navegador; o token e os dados do Jira nunca vão.
        </p>
        <div className={styles.blocked}>
          <h3 className={sectionStyles.subheading}>Pessoas bloqueadas</h3>
          <p className={styles.blockedHint}>
            Bloquear usuário num envio impede essa pessoa de mandar de novo. Recusar só dispensa esta mensagem. Liberar aqui faz o
            próximo envio voltar a pedir a sua confirmação.
          </p>
          {blockedSenders.length === 0 ? (
            <p className={styles.blockedHint}>Nenhuma pessoa bloqueada.</p>
          ) : (
            <ul className={styles.blockedList}>
              {blockedSenders.map((sender) => (
                <li key={sender.accountId} className={styles.blockedItem}>
                  <span className={styles.blockedText}>
                    <span className={styles.blockedName}>{sender.name}</span>
                    {sender.email && <span className={styles.blockedEmail}>{sender.email}</span>}
                  </span>
                  <Button variant="secondary" className={sectionStyles.shareAction} onClick={() => releaseSender(sender.accountId)}>
                    Liberar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {rejectionSummary(rejectedPeers).map((line) => (
          <p key={line} className={sectionStyles.cardText}>
            {line}
          </p>
        ))}
        {failedConnections > 0 && (
          <p className={sectionStyles.cardText}>
            {failedConnections === 1 ? '1 conexão não abriu' : `${failedConnections} conexões não abriram`} nesta sessão: a rede
            de um dos lados (ex: VPN, firewall da empresa) bloqueia a conexão direta entre navegadores.
          </p>
        )}
      </div>
    </section>
  );
}
