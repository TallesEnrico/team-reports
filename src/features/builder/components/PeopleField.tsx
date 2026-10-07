import { useId, useMemo, useState } from 'react';
import type { JiraUser } from '../../../api/jira-users';
import { useAllUsersQuery } from '../../../api/useAllUsersQuery';
import { useSquadsMembersQuery } from '../../../api/useSquadMembersQuery';
import { Avatar } from '../../../components/Avatar';
import { FormField } from '../../../components/FormField';
import { MultiSelect } from '../../../components/MultiSelect';
import type { PeopleChoice } from '../types';
import styles from './InspectorFields.module.css';

interface PersonOption {
  value: string;
  label: string;
  user: JiraUser;
}

interface PeopleFieldProps {
  /** "De quem" (horas) ou "Responsável" (issues). */
  label: string;
  allLabel: string;
  meLabel: string;
  value: PeopleChoice;
  /** As squads da peça (vazio = todas): as pessoas delas aparecem primeiro na lista. */
  projectKeys: string[];
  onChange: (value: PeopleChoice) => void;
}

function toOption(user: JiraUser): PersonOption {
  return { value: user.accountId, label: user.displayName, user };
}

/**
 * De quem são os dados de uma peça: todas as pessoas, as escolhidas entre os
 * funcionários do Jira (as das squads da peça primeiro) ou só a conta conectada.
 */
export function PeopleField({ label, allLabel, meLabel, value, projectKeys, onChange }: PeopleFieldProps) {
  const modeId = useId();
  const listId = useId();
  const [input, setInput] = useState('');
  const membersQuery = useSquadsMembersQuery(projectKeys);
  const allUsersQuery = useAllUsersQuery();
  const members = membersQuery.data;
  const allUsers = allUsersQuery.data;

  const groups = useMemo(() => {
    const memberIds = new Set(members.map((user) => user.accountId));
    const others = (allUsers ?? []).filter((user) => !memberIds.has(user.accountId));
    return [
      { label: projectKeys.length === 1 ? `Pessoas da squad ${projectKeys[0]}` : 'Pessoas das squads escolhidas', options: members.map(toOption) },
      { label: projectKeys.length > 0 ? 'Outras pessoas do Jira' : 'Pessoas do Jira', options: others.map(toOption) },
    ].filter((group) => group.options.length > 0);
  }, [members, allUsers, projectKeys]);

  const byId = useMemo(() => new Map(groups.flatMap((group) => group.options).map((option) => [option.value, option])), [groups]);
  const selected = value.accountIds.map(
    (accountId) =>
      byId.get(accountId) ?? toOption({ accountId, displayName: value.names[accountId] ?? 'Pessoa sem nome no Jira' }),
  );

  function choose(users: JiraUser[]) {
    onChange({
      mode: 'chosen',
      accountIds: users.map((user) => user.accountId),
      names: Object.fromEntries(users.map((user) => [user.accountId, user.displayName])),
    });
  }

  // As pessoas das squads da peça que ainda não estão na escolha.
  const missingMembers = members.filter((user) => !value.accountIds.includes(user.accountId));

  return (
    <>
      <FormField label={label} htmlFor={modeId}>
        <select
          id={modeId}
          className="input"
          value={value.mode}
          onChange={(event) => {
            const mode = event.target.value as PeopleChoice['mode'];
            onChange(mode === 'chosen' ? { ...value, mode } : { mode, accountIds: [], names: {} });
          }}
        >
          <option value="all">{allLabel}</option>
          <option value="chosen">Escolher pessoas…</option>
          <option value="me">{meLabel}</option>
        </select>
      </FormField>
      {value.mode === 'chosen' && (
        <FormField
          label="Quais pessoas"
          htmlFor={listId}
          hint={
            <>
              Quem não tiver nada no período aparece zerado nos grupos por pessoa.
              {projectKeys.length > 0 && missingMembers.length > 0 && (
                <>
                  {' '}
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => choose([...selected.map((option) => option.user), ...missingMembers])}
                  >
                    Adicionar as {missingMembers.length} pessoas {projectKeys.length === 1 ? 'da squad' : 'das squads'}
                  </button>
                </>
              )}
            </>
          }
        >
          <MultiSelect<PersonOption>
            inputId={listId}
            placeholder="Busque pelo nome"
            options={groups}
            value={selected}
            onChange={(next) => choose(next.map((option) => option.user))}
            inputValue={input}
            onInputChange={(next, meta) => {
              // Mantém o termo ao escolher, para escolher várias pessoas da mesma busca.
              if (meta.action === 'input-change') setInput(next);
              if (meta.action === 'menu-close' || meta.action === 'input-blur') setInput('');
            }}
            isLoading={allUsersQuery.isLoading || membersQuery.isPending}
            noOptionsMessage={() =>
              allUsersQuery.isError && groups.length === 0 ? 'Não foi possível carregar as pessoas do Jira' : 'Ninguém com esse nome'
            }
            formatOptionLabel={(option) => (
              <span className={styles.person}>
                <Avatar src={option.user.avatarUrl} name={option.label} size={18} />
                <span className={styles.personName}>{option.label}</span>
              </span>
            )}
          />
        </FormField>
      )}
    </>
  );
}
