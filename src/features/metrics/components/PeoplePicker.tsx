import { useMemo } from 'react';
import { useCurrentUserQuery } from '../../../api/useCurrentUserQuery';
import { AvatarPeopleField, type AvatarPerson, type AvatarPersonGroup, type AvatarPersonOption } from '../../../components/AvatarPeopleField';
import type { JiraUser } from '../types';

interface PersonGroup {
  label: string;
  users: JiraUser[];
}

interface PeoplePickerProps {
  inputId: string;
  hasSquads: boolean;
  contributors: JiraUser[];
  members: JiraUser[];
  allUsers: JiraUser[];
  isLoadingUsers: boolean;
  usersFailed: boolean;
  isAllPeople: boolean;
  selected: JiraUser[];
  onChange: (people: JiraUser[] | 'all') => void;
}

const ALL_VALUE = 'all';

function toOption(user: JiraUser, selected: boolean): AvatarPersonOption {
  return { id: user.accountId, name: user.displayName, avatarUrl: user.avatarUrl, selected, kind: 'person' };
}

export function PeoplePicker({
  inputId,
  hasSquads,
  contributors,
  members,
  allUsers,
  isLoadingUsers,
  usersFailed,
  isAllPeople,
  selected,
  onChange,
}: PeoplePickerProps) {
  const currentUser = useCurrentUserQuery().data;
  const { allLabel, allCount, groups, byId } = useMemo(() => {
    const contributorIds = new Set(contributors.map((user) => user.accountId));
    const otherMembers = members.filter((user) => !contributorIds.has(user.accountId));
    const squadIds = new Set([...contributorIds, ...otherMembers.map((user) => user.accountId)]);
    const candidates: PersonGroup[] = hasSquads
      ? [
          { label: 'Lançaram horas na squad', users: contributors },
          { label: 'Outras pessoas', users: otherMembers },
          { label: 'Outras pessoas do Jira', users: allUsers.filter((user) => !squadIds.has(user.accountId)) },
        ]
      : [{ label: 'Pessoas do Jira', users: allUsers }];
    const known = new Map<string, JiraUser>();
    for (const user of [...contributors, ...members, ...allUsers, ...selected]) known.set(user.accountId, user);
    return {
      allLabel: hasSquads ? 'Todas as pessoas' : 'Todas as pessoas do Jira',
      allCount: hasSquads ? squadIds.size : allUsers.length,
      groups: candidates.filter((group) => group.users.length > 0),
      byId: known,
    };
  }, [hasSquads, contributors, members, allUsers, selected]);

  const selectedIds = useMemo(() => new Set(selected.map((user) => user.accountId)), [selected]);

  const squad = useMemo<AvatarPerson[]>(() => {
    const seen = new Set<string>();
    const list: AvatarPerson[] = [];
    for (const user of contributors) {
      if (user.accountId === currentUser?.accountId || seen.has(user.accountId)) continue;
      seen.add(user.accountId);
      list.push({ id: user.accountId, name: user.displayName, avatarUrl: user.avatarUrl });
    }
    return list;
  }, [contributors, currentUser?.accountId]);

  const optionGroups = useMemo<AvatarPersonGroup[]>(() => {
    const listed = new Set(groups.flatMap((group) => group.users.map((user) => user.accountId)));
    const missing = isAllPeople ? [] : selected.filter((user) => !listed.has(user.accountId));
    const peopleGroups = [
      ...(missing.length > 0 ? [{ label: 'Escolhidas', options: missing.map((user) => toOption(user, true)) }] : []),
      ...groups.map((group) => ({
        label: group.label,
        options: group.users.map((user) => toOption(user, !isAllPeople && selectedIds.has(user.accountId))),
      })),
    ];
    if (allCount === 0) return peopleGroups;
    const allOption: AvatarPersonOption = {
      id: ALL_VALUE,
      name: allLabel,
      selected: isAllPeople,
      kind: 'all',
      detail: String(allCount),
    };
    return [{ options: [allOption] }, ...peopleGroups];
  }, [groups, allCount, allLabel, isAllPeople, selectedIds, selected]);

  function toggle(id: string) {
    if (id === ALL_VALUE) {
      onChange(isAllPeople ? [] : 'all');
      return;
    }
    const user = byId.get(id);
    if (!user) return;
    if (isAllPeople) {
      onChange([user]);
      return;
    }
    onChange(selectedIds.has(id) ? selected.filter((person) => person.accountId !== id) : [...selected, user]);
  }

  return (
    <AvatarPeopleField
      inputId={inputId}
      people={isAllPeople ? [] : selected.map((user) => ({ id: user.accountId, name: user.displayName, avatarUrl: user.avatarUrl }))}
      self={
        currentUser
          ? { id: currentUser.accountId, name: currentUser.displayName, avatarUrl: currentUser.avatarUrl }
          : undefined
      }
      suggestions={squad}
      groups={optionGroups}
      onToggle={toggle}
      isLoading={!hasSquads && isLoadingUsers}
      emptyText={!hasSquads && usersFailed ? 'Não foi possível carregar as pessoas do Jira' : 'Ninguém com esse nome'}
      emptyLabel={hasSquads ? 'Quem lançou horas na squad' : 'Escolha as pessoas'}
      summary={isAllPeople ? allLabel : undefined}
    />
  );
}
