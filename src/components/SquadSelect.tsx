import { useMemo } from 'react';
import type { JiraProject } from '../api/jira-projects';
import { SingleSelect } from './SingleSelect';
import styles from './SquadSelect.module.css';
import { type SquadOption, squadOptionOf, toSquadOptions } from './squadOptions';

interface SquadSelectProps {
  inputId: string;
  projects: JiraProject[];
  /** Squad mostrada (a escolhida ou a da conta conectada). */
  projectKey: string | undefined;
  /** Squad da conta conectada, marcada na lista como "sua squad". */
  connectedSquad: string | undefined;
  isLoading: boolean;
  /** `null` = a squad da conta conectada (fica salva como "padrão": se ela mudar, a tela acompanha). */
  onChange: (projectKey: string | null) => void;
}

/** Escolha da squad (projeto do Jira) na lateral do Kanban. */
export function SquadSelect({ inputId, projects, projectKey, connectedSquad, isLoading, onChange }: SquadSelectProps) {
  const options = useMemo(() => toSquadOptions(projects, connectedSquad), [projects, connectedSquad]);
  const selected = projectKey ? squadOptionOf(options, projectKey, connectedSquad) : null;

  return (
    <SingleSelect<SquadOption>
      inputId={inputId}
      placeholder="Escolha a squad"
      options={options}
      value={selected}
      isLoading={isLoading}
      onChange={(option) => option && onChange(option.isConnected ? null : option.value)}
      // Portal: na lateral rolável o menu seria cortado.
      menuPortalTarget={document.body}
      styles={{ menuPortal: (base) => ({ ...base, zIndex: 50 }) }}
      formatOptionLabel={(option, { context }) =>
        context === 'value' ? option.label : <SquadOptionLabel option={option} />
      }
    />
  );
}

/** Opção da lista de squads: nome, chave e a marca "sua squad". */
export function SquadOptionLabel({ option }: { option: SquadOption }) {
  return (
    <span className={styles.option}>
      <span className={styles.name}>{option.name}</span>
      <span className={styles.key}>
        {option.value}
        {option.isConnected && ' · sua squad'}
      </span>
    </span>
  );
}
