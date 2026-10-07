import { useId, useMemo } from 'react';
import { useProjectsQuery } from '../../../api/useProjectsQuery';
import { FormField } from '../../../components/FormField';
import { MultiSelect } from '../../../components/MultiSelect';
import { SquadOptionLabel } from '../../../components/SquadSelect';
import { type SquadOption, squadOptionOf, toSquadOptions } from '../../../components/squadOptions';
import type { ProjectChoice } from '../types';

type Mode = 'all' | 'chosen' | 'squad';

interface ProjectsFieldProps {
  value: ProjectChoice;
  connectedSquad: string | undefined;
  onChange: (value: ProjectChoice) => void;
}

/** Squads (projetos) das peças de dados: todas, as escolhidas ou a da conta (que acompanha se ela mudar). */
export function ProjectsField({ value, connectedSquad, onChange }: ProjectsFieldProps) {
  const modeId = useId();
  const listId = useId();
  const projectsQuery = useProjectsQuery();
  const options = useMemo(() => toSquadOptions(projectsQuery.data ?? [], connectedSquad), [projectsQuery.data, connectedSquad]);
  const mode: Mode = value === null ? 'squad' : value.length === 0 ? 'all' : 'chosen';

  function chooseMode(next: Mode) {
    if (next === 'squad') onChange(null);
    else if (next === 'all') onChange([]);
    else onChange(connectedSquad ? [connectedSquad] : options.slice(0, 1).map((option) => option.value));
  }

  return (
    <>
      <FormField label="Squads" htmlFor={modeId}>
        <select id={modeId} className="input" value={mode} onChange={(event) => chooseMode(event.target.value as Mode)}>
          <option value="all">Todas as squads</option>
          <option value="chosen">Escolher squads…</option>
          <option value="squad">{connectedSquad ? `Minha squad (${connectedSquad})` : 'Minha squad'}</option>
        </select>
      </FormField>
      {mode === 'chosen' && (
        <FormField label="Quais squads" htmlFor={listId} hint="Pelo menos uma. Para todas, use a opção acima.">
          <MultiSelect<SquadOption>
            inputId={listId}
            placeholder="Escolha as squads"
            options={options}
            value={(value ?? []).map((key) => squadOptionOf(options, key, connectedSquad))}
            isLoading={projectsQuery.isLoading}
            isClearable={false}
            onChange={(next) => {
              if (next.length > 0) onChange(next.map((option) => option.value));
            }}
            noOptionsMessage={() => 'Nenhuma squad com esse nome'}
            formatOptionLabel={(option, { context }) =>
              context === 'value' ? <span title={option.label}>{option.value}</span> : <SquadOptionLabel option={option} />
            }
          />
        </FormField>
      )}
    </>
  );
}
