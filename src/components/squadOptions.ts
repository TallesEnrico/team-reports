import type { JiraProject } from '../api/jira-projects';

export interface SquadOption {
  value: string;
  label: string;
  name: string;
  isConnected: boolean;
}

/** Opções dos seletores de squad, com a squad da conta conectada marcada. */
export function toSquadOptions(projects: JiraProject[], connectedSquad: string | undefined): SquadOption[] {
  return projects.map((project) => ({
    value: project.key,
    label: `${project.name} (${project.key})`,
    name: project.name,
    isConnected: project.key === connectedSquad,
  }));
}

/** A opção da squad; enquanto a lista carrega, a squad aparece pela chave. */
export function squadOptionOf(options: SquadOption[], projectKey: string, connectedSquad: string | undefined): SquadOption {
  return (
    options.find((option) => option.value === projectKey) ?? {
      value: projectKey,
      label: projectKey,
      name: projectKey,
      isConnected: projectKey === connectedSquad,
    }
  );
}
