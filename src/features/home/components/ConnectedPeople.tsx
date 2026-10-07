import { type CSSProperties, useMemo } from 'react';
import { useCurrentUserQuery } from '../../../api/useCurrentUserQuery';
import { Avatar } from '../../../components/Avatar';
import { useJiraConnectionStore } from '../../../store/useJiraConnectionStore';
import { getDeviceId } from '../../peer-sharing/lib/device';
import { groupPeers } from '../../peer-sharing/lib/protocol';
import { usePeerStore } from '../../peer-sharing/store/usePeerStore';
import styles from './ConnectedPeople.module.css';

const VISIBLE = 3;

type Face = { key: string; name: string; email: string; avatarUrl: string | null };

export function ConnectedPeople() {
  const peers = usePeerStore((state) => state.peers);
  const accountId = usePeerStore((state) => state.accountId);
  const status = usePeerStore((state) => state.status);
  const deviceId = useMemo(getDeviceId, []);
  const me = useCurrentUserQuery().data;
  const myEmail = useJiraConnectionStore((state) => state.credentials?.email) ?? '';
  const faces = useMemo(() => {
    const groups = groupPeers(peers, { accountId, deviceId });
    const list: Face[] = [];
    const myName = me?.displayName ?? 'Você';
    const myPhoto = me?.avatarUrl ?? null;
    if (status === 'online') {
      list.push({ key: `self:${accountId ?? deviceId}`, name: myName, email: myEmail, avatarUrl: myPhoto });
    }
    for (const person of groups.people) {
      list.push({ key: `person:${person.accountId}`, name: person.name, email: person.email, avatarUrl: person.avatarUrl });
    }
    return list;
  }, [peers, accountId, deviceId, status, me?.displayName, me?.avatarUrl, myEmail]);

  if (faces.length === 0) return null;

  const label = faces.length === 1 ? '1 pessoa conectada' : `${faces.length} pessoas conectadas`;

  return (
    <div className={styles.presence} tabIndex={0}>
      <ul className={styles.stack} aria-label={label}>
        {faces.slice(0, VISIBLE).map((person, index) => (
          <li key={person.key} className={styles.face} style={{ '--i': index } as CSSProperties}>
            <span className={styles.clip}>
              <Avatar src={person.avatarUrl ?? undefined} name={person.name} size={28} />
            </span>
            <span className={styles.dot} aria-hidden />
          </li>
        ))}
      </ul>
      <span className={styles.caption}>Conectados</span>
      <ul className={styles.menu} aria-label={label}>
        <p className='text-[13px] leading-tight text-gray-500 px-3'>Você pode compartilhar <a className='text-blue-500' href="/dashboard">Dashboards</a> com outros usuários online. Abra as opções do dashboard e clique em compartilhar.</p>
      </ul>
    </div>
  );
}
