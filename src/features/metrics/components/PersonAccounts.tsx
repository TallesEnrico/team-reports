import { ArrowSquareOut, LinkSimple } from '@phosphor-icons/react';
import { useId, useState } from 'react';
import { jiraProfileUrl } from '../../../api/jira-client';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import type { JiraUser } from '../types';
import styles from './PersonAccounts.module.css';

interface PersonAccountsProps {
  user: JiraUser;
  /** Contas já juntadas a esta. */
  linkedAccounts: JiraUser[];
  /** Outras pessoas da lista que podem ser juntadas; as de nome parecido vêm à parte. */
  candidates: JiraUser[];
  suggestions: JiraUser[];
  onMerge: (accountId: string) => void;
  onSplit: (accountId: string) => void;
}

function AccountRow({ user, isPrimary, onSplit }: { user: JiraUser; isPrimary: boolean; onSplit?: () => void }) {
  return (
    <li className={styles.account}>
      <Avatar src={user.avatarUrl} name={user.displayName} size={22} />
      <span className={styles.name}>
        {user.displayName}
        <span className={styles.tags}>
          {isPrimary ? 'conta principal' : 'juntada'}
          {user.active === false && ' · desativada no Jira'}
        </span>
      </span>
      <a className={styles.profile} href={jiraProfileUrl(user.accountId)} target="_blank" rel="noreferrer">
        Perfil no Jira <ArrowSquareOut size={12} weight="bold" aria-hidden />
      </a>
      {onSplit && (
        <Button variant="ghost" className={styles.split} onClick={onSplit} title="As horas desta conta voltam a ser de uma pessoa à parte">
          Separar
        </Button>
      )}
    </li>
  );
}

/**
 * Contas do Jira da pessoa. A mesma pessoa com duas contas (ex: um e-mail
 * antigo) aparece duas vezes na lista; juntando, as horas das duas contam como
 * de uma pessoa só, com o nome desta conta. Fica salvo e vale para todas as squads.
 */
export function PersonAccounts({ user, linkedAccounts, candidates, suggestions, onMerge, onSplit }: PersonAccountsProps) {
  const titleId = useId();
  const selectId = useId();
  const [choice, setChoice] = useState('');
  const suggestedIds = new Set(suggestions.map((candidate) => candidate.accountId));
  const others = candidates.filter((candidate) => !suggestedIds.has(candidate.accountId));

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.title}>
        Contas no Jira
      </h3>
      <ul className={styles.accounts}>
        <AccountRow user={user} isPrimary />
        {linkedAccounts.map((account) => (
          <AccountRow key={account.accountId} user={account} isPrimary={false} onSplit={() => onSplit(account.accountId)} />
        ))}
      </ul>

      {candidates.length > 0 && (
        <form
          className={styles.merge}
          onSubmit={(event) => {
            event.preventDefault();
            if (!choice) return;
            onMerge(choice);
            setChoice('');
          }}
        >
          <label className="sr-only" htmlFor={selectId}>
            Outra conta desta pessoa
          </label>
          <select id={selectId} className="input" value={choice} onChange={(event) => setChoice(event.target.value)}>
            <option value="">Outra conta desta pessoa…</option>
            {suggestions.length > 0 && (
              <optgroup label="Nome parecido">
                {suggestions.map((candidate) => (
                  <option key={candidate.accountId} value={candidate.accountId}>
                    {candidate.displayName}
                  </option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label="Outras pessoas da lista">
                {others.map((candidate) => (
                  <option key={candidate.accountId} value={candidate.accountId}>
                    {candidate.displayName}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <Button type="submit" variant="secondary" icon={<LinkSimple size={14} weight="bold" />} disabled={!choice}>
            Juntar
          </Button>
        </form>
      )}
      <p className={styles.hint}>
        Use quando a mesma pessoa tem duas contas no Jira (ex: um e-mail antigo): as horas das duas passam a contar juntas,
        com o nome de {user.displayName}. "Separar" desfaz. Na dúvida, compare os perfis no Jira.
      </p>
    </section>
  );
}
