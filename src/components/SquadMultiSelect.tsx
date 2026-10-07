import { useMemo } from 'react';
import type { JiraProject } from '../api/jira-projects';
import { MultiSelect } from './MultiSelect';
import { SquadOptionLabel } from './SquadSelect';
import { type SquadOption, squadOptionOf, toSquadOptions } from './squadOptions';

interface SquadMultiSelectProps {
  inputId: string;
  projects: JiraProject[];
  /** Squads mostradas (as escolhidas ou a da conta conectada); pode ser nenhuma. */
  projectKeys: string[];
  /** Squad da conta conectada, marcada na lista como "sua squad". */
  connectedSquad: string | undefined;
  isLoading: boolean;
  /** `null` = só a squad da conta conectada (fica salva como "padrão": se ela mudar, a tela acompanha); `[]` = nenhuma. */
  onChange: (projectKeys: string[] | null) => void;
}

/** Escolha das squads (projetos do Jira) na lateral do Metrics: uma, várias ou nenhuma. */
export function SquadMultiSelect({ inputId, projects, projectKeys, connectedSquad, isLoading, onChange }: SquadMultiSelectProps) {
  const options = useMemo(() => toSquadOptions(projects, connectedSquad), [projects, connectedSquad]);
  const selected = projectKeys.map((projectKey) => squadOptionOf(options, projectKey, connectedSquad));

  return (
    <MultiSelect<SquadOption>
      inputId={inputId}
      placeholder="Nenhuma squad"
      options={options}
      value={selected}
      isLoading={isLoading}
      onChange={(next) => {
        const keys = next.map((option) => option.value);
        onChange(keys.length === 1 && keys[0] === connectedSquad ? null : keys);
      }}
      noOptionsMessage={() => 'Nenhuma squad com esse nome'}
      formatOptionLabel={(option, { context }) =>
        context === 'value' ? <span title={option.label}>{option.value}</span> : <SquadOptionLabel option={option} />
      }
    />
  );
}
