import { useMemo, useState } from 'react';
import { useCurrentUserQuery } from '../../../api/useCurrentUserQuery';
import { useSquadsAuthorsQuery } from '../../../api/useSquadMembersQuery';
import { AvatarPeopleField, type AvatarPerson, type AvatarPersonGroup, type AvatarPersonOption } from '../../../components/AvatarPeopleField';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useJiraConnectionStore } from '../../../store/useJiraConnectionStore';
import { useUserGroupSearchQuery } from '../api/useUserGroupSearchQuery';
import { useReportFiltersStore } from '../store/useReportFiltersStore';
import type { JiraUser, Principal } from '../types';

interface UserGroupPickerProps {
  inputId?: string;
  value: Principal[];
  onChange: (principals: Principal[]) => void;
}

function principalId(principal: Principal): string {
  switch (principal.type) {
    case 'current-user':
      return 'current-user';
    case 'user':
      return `user:${principal.accountId}`;
    case 'group':
      return `group:${principal.groupId}`;
  }
}

function principalName(principal: Principal, currentUser: JiraUser | undefined): string {
  switch (principal.type) {
    case 'current-user':
      return currentUser ? `Eu (${currentUser.displayName})` : 'Usuário atual';
    case 'user':
      return principal.displayName;
    case 'group':
      return principal.name;
  }
}

function principalFaceName(principal: Principal, currentUser: JiraUser | undefined): string {
  if (principal.type === 'current-user') return currentUser?.displayName ?? 'Você';
  return principalName(principal, currentUser);
}

function principalAvatar(principal: Principal, currentUser: JiraUser | undefined): string | undefined {
  if (principal.type === 'current-user') return currentUser?.avatarUrl;
  if (principal.type === 'user') return principal.avatarUrl;
  return undefined;
}

function toOption(principal: Principal, selected: boolean, currentUser: JiraUser | undefined): AvatarPersonOption {
  return {
    id: principalId(principal),
    name: principalName(principal, currentUser),
    avatarUrl: principalAvatar(principal, currentUser),
    selected,
    kind: principal.type === 'group' ? 'group' : 'person',
  };
}

export function UserGroupPicker({ inputId, value, onChange }: UserGroupPickerProps) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const { data: currentUser } = useCurrentUserQuery();
  const projectKeys = useReportFiltersStore((state) => state.draft.projectKeys);
  const connectedSquad = useJiraConnectionStore((state) => state.credentials?.squad);
  const memberKeys = connectedSquad ? [connectedSquad] : projectKeys;
  const members = useSquadsAuthorsQuery(memberKeys);
  const search = useUserGroupSearchQuery(debouncedQuery);
  const isSearching = query.trim().length >= 2;

  const catalog = useMemo(() => {
    const map = new Map<string, Principal>();
    map.set('current-user', { type: 'current-user' });
    for (const principal of value) map.set(principalId(principal), principal);
    for (const user of members.data) {
      map.set(`user:${user.accountId}`, {
        type: 'user',
        accountId: user.accountId,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      });
    }
    for (const user of search.data?.users ?? []) {
      map.set(`user:${user.accountId}`, {
        type: 'user',
        accountId: user.accountId,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      });
    }
    for (const group of search.data?.groups ?? []) {
      map.set(`group:${group.groupId}`, { type: 'group', groupId: group.groupId, name: group.name });
    }
    return map;
  }, [value, members.data, search.data]);

  const people = useMemo<AvatarPerson[]>(
    () =>
      value.map((principal) => ({
        id: principalId(principal),
        name: principalFaceName(principal, currentUser),
        avatarUrl: principalAvatar(principal, currentUser),
      })),
    [value, currentUser],
  );

  const selectedIds = useMemo(() => new Set(value.map(principalId)), [value]);

  const squadUsers = useMemo(
    () => members.data.filter((user) => user.accountId !== currentUser?.accountId),
    [members.data, currentUser?.accountId],
  );

  const suggestions = useMemo<AvatarPerson[]>(
    () => squadUsers.map((user) => ({ id: `user:${user.accountId}`, name: user.displayName, avatarUrl: user.avatarUrl })),
    [squadUsers],
  );

  const groups = useMemo<AvatarPersonGroup[]>(() => {
    if (!isSearching) {
      const chosen = value.filter((principal) => principal.type !== 'current-user').map((principal) => toOption(principal, true, currentUser));
      const squad = squadUsers
        .filter((user) => !selectedIds.has(`user:${user.accountId}`))
        .map((user) =>
          toOption({ type: 'user', accountId: user.accountId, displayName: user.displayName, avatarUrl: user.avatarUrl }, false, currentUser),
        );
      return [
        { label: 'Atalhos', options: [toOption({ type: 'current-user' }, selectedIds.has('current-user'), currentUser)] },
        ...(chosen.length > 0 ? [{ label: 'Escolhidas', options: chosen }] : []),
        ...(squad.length > 0 ? [{ label: 'Pessoas', options: squad }] : []),
      ];
    }
    return [
      {
        label: 'Pessoas',
        options: (search.data?.users ?? []).map((user) =>
          toOption(
            { type: 'user', accountId: user.accountId, displayName: user.displayName, avatarUrl: user.avatarUrl },
            selectedIds.has(`user:${user.accountId}`),
            currentUser,
          ),
        ),
      },
      {
        label: 'Grupos',
        options: (search.data?.groups ?? []).map((group) =>
          toOption({ type: 'group', groupId: group.groupId, name: group.name }, selectedIds.has(`group:${group.groupId}`), currentUser),
        ),
      },
    ].filter((group) => group.options.length > 0);
  }, [isSearching, value, selectedIds, currentUser, squadUsers, search.data]);

  function toggle(id: string) {
    if (selectedIds.has(id)) {
      onChange(value.filter((principal) => principalId(principal) !== id));
      return;
    }
    const principal = catalog.get(id);
    if (principal) onChange([...value, principal]);
  }

  let emptyText = 'Digite para buscar pessoas e grupos';
  if (isSearching) emptyText = 'Nenhuma pessoa ou grupo encontrado';
  else if (query.trim().length > 0) emptyText = 'Digite ao menos 2 letras';

  return (
    <AvatarPeopleField
      inputId={inputId}
      people={people}
      self={{
        id: 'current-user',
        name: currentUser?.displayName ?? 'Você',
        avatarUrl: currentUser?.avatarUrl,
      }}
      suggestions={suggestions}
      groups={groups}
      onToggle={toggle}
      onQueryChange={setQuery}
      filterLocally={false}
      isLoading={isSearching && search.isFetching}
      emptyText={emptyText}
      searchPlaceholder="Buscar pessoa ou grupo"
      emptyLabel="Todas as pessoas"
    />
  );
}
