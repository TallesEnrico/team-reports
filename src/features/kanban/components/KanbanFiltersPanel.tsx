import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { useId, useMemo } from 'react';
import { useCurrentUserQuery } from '../../../api/useCurrentUserQuery';
import { useSquadAuthorsQuery } from '../../../api/useSquadMembersQuery';
import { AvatarPeopleField } from '../../../components/AvatarPeopleField';
import { Button } from '../../../components/Button';
import { FormField } from '../../../components/FormField';
import { MultiSelect } from '../../../components/MultiSelect';
import { SquadSelect } from '../../../components/SquadSelect';
import { useKanbanBoard } from '../hooks/useKanbanBoard';
import { collectFilterOptions, type FilterOption, type FilterOptions, hasActiveFilters } from '../lib/boardView';
import { useKanbanStore } from '../store/useKanbanStore';
import { ME } from '../types';
import { FilterToggleList } from './FilterToggleList';
import styles from './KanbanFiltersPanel.module.css';

const NO_OPTIONS: FilterOptions = { issueTypes: [], parents: [] };

interface PersonOption {
  value: string;
  label: string;
  avatarUrl?: string;
}

/** Filtros do quadro na lateral; valem na hora, sem botão de aplicar. */
export function KanbanFiltersPanel() {
  const {
    connectedSquad,
    projectKey,
    projects,
    projectsQuery,
    members,
    membersQuery,
    assignees,
    boards,
    board,
    configuration,
    issues,
  } = useKanbanBoard();
  const currentUser = useCurrentUserQuery().data;
  const authorsQuery = useSquadAuthorsQuery(projectKey);
  const authors = authorsQuery.data ?? [];
  const filters = useKanbanStore((state) => state.filters);
  const setFilters = useKanbanStore((state) => state.setFilters);
  const clearFilters = useKanbanStore((state) => state.clearFilters);
  const selectProject = useKanbanStore((state) => state.selectProject);
  const selectBoard = useKanbanStore((state) => state.selectBoard);
  const setAssignees = useKanbanStore((state) => state.setAssignees);
  const squadId = useId();
  const peopleId = useId();
  const boardId = useId();
  const searchId = useId();
  const parentsId = useId();

  const options = useMemo(
    () => (configuration && issues ? collectFilterOptions(configuration.columns, issues) : NO_OPTIONS),
    [configuration, issues],
  );
  // A conta conectada vem primeiro, como "Você"; ela entra no JQL como currentUser().
  const personOptions = useMemo<PersonOption[]>(() => {
    const me: PersonOption = {
      value: ME,
      label: currentUser ? `Você (${currentUser.displayName})` : 'Você',
      avatarUrl: currentUser?.avatarUrl,
    };
    const others = members
      .filter((member) => member.accountId !== currentUser?.accountId)
      .map((member) => ({ value: member.accountId, label: member.displayName, avatarUrl: member.avatarUrl }));
    return [me, ...others];
  }, [members, currentUser]);
  const selectedPeople = assignees.map(
    (id) => personOptions.find((option) => option.value === id) ?? { value: id, label: 'Pessoa fora da squad' },
  );

  // Quadros criados na squad separados dos de outros projetos que só incluem issues dela.
  const boardGroups = [
    { label: 'Quadros da squad', boards: boards.filter((candidate) => candidate.projectKey === projectKey) },
    {
      label: 'Outros quadros com issues da squad',
      boards: boards.filter((candidate) => candidate.projectKey !== projectKey),
    },
  ].filter((group) => group.boards.length > 0);

  const selectedParents = filters.parentKeys.map(
    (key) => options.parents.find((option) => option.id === key) ?? { id: key, label: key, count: 0 },
  );

  return (
    <div className={styles.panel} role="search" aria-label="Filtros do quadro">
      <FormField
        label="Squad"
        htmlFor={squadId}
        hint={projectsQuery.isError ? 'Não foi possível carregar as squads.' : undefined}
      >
        <SquadSelect
          inputId={squadId}
          projects={projects}
          projectKey={projectKey}
          connectedSquad={connectedSquad}
          isLoading={projectsQuery.isLoading}
          onChange={selectProject}
        />
      </FormField>

      {boards.length > 1 && projectKey && (
        <FormField label="Quadro" htmlFor={boardId}>
          <select
            id={boardId}
            className="input"
            value={board?.id}
            onChange={(event) => {
              selectBoard(projectKey, Number(event.target.value));
              clearFilters();
            }}
          >
            {boardGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.boards.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </FormField>
      )}

      <FormField
        label="Pessoas"
        htmlFor={peopleId}
        hint={
          membersQuery.isError
            ? 'Não foi possível carregar as pessoas da squad.'
            : assignees.length === 0
              ? 'Sem ninguém escolhido, o quadro mostra todas as pessoas.'
              : 'Cards de quem estiver escolhido.'
        }
      >
        <AvatarPeopleField
          inputId={peopleId}
          people={selectedPeople.map((option) => ({
            id: option.value,
            name: option.value === ME ? (currentUser?.displayName ?? 'Você') : option.label,
            avatarUrl: option.avatarUrl,
          }))}
          self={{ id: ME, name: currentUser?.displayName ?? 'Você', avatarUrl: currentUser?.avatarUrl }}
          suggestions={authors
            .filter((author) => author.accountId !== currentUser?.accountId)
            .map((author) => ({ id: author.accountId, name: author.displayName, avatarUrl: author.avatarUrl }))}
          groups={[
            {
              options: personOptions.map((option) => ({
                id: option.value,
                name: option.label,
                avatarUrl: option.avatarUrl,
                selected: assignees.includes(option.value),
              })),
            },
          ]}
          onToggle={(id) => {
            if (!projectKey) return;
            const next = assignees.includes(id) ? assignees.filter((value) => value !== id) : [...assignees, id];
            setAssignees(projectKey, next);
          }}
          isLoading={authorsQuery.isLoading || membersQuery.isLoading}
          emptyText="Ninguém com esse nome na squad"
          summary={assignees.length === 0 ? 'Todas as pessoas' : undefined}
        />
      </FormField>

      <FormField label="Pesquisar" htmlFor={searchId}>
        <div className={styles.search}>
          <MagnifyingGlass size={16} weight="bold" className={styles.searchIcon} aria-hidden />
          <input
            id={searchId}
            className={`input ${styles.searchInput}`}
            type="search"
            placeholder="Resumo"
            autoComplete="off"
            value={filters.search}
            onChange={(event) => setFilters({ search: event.target.value })}
          />
        </div>
      </FormField>

      <FormField label="Epic / issue pai" htmlFor={parentsId}>
        <MultiSelect<FilterOption>
          inputId={parentsId}
          placeholder="Todas"
          options={options.parents}
          value={selectedParents}
          getOptionValue={(option) => option.id}
          getOptionLabel={(option) => `${option.label} ${option.detail ?? ''}`}
          onChange={(selected) => setFilters({ parentKeys: selected.map((option) => option.id) })}
          formatOptionLabel={(option, { context }) =>
            context === 'value' ? (
              option.label
            ) : (
              <span className={styles.parentOption}>
                <span className={styles.parentKey}>{option.label}</span>
                <span className={styles.parentSummary}>{option.detail}</span>
              </span>
            )
          }
        />
      </FormField>

      <FilterToggleList
        legend="Tipo"
        options={options.issueTypes}
        selected={filters.issueTypeIds}
        onChange={(issueTypeIds) => setFilters({ issueTypeIds })}
        emptyText="Nenhum tipo nos cards."
      />

      {hasActiveFilters(filters) && (
        <Button variant="ghost" icon={<X size={14} weight="bold" />} onClick={clearFilters} className={styles.clear}>
          Limpar filtros
        </Button>
      )}
    </div>
  );
}
