import { useId } from 'react';
import { FormField } from '../../../components/FormField';
import { ISSUE_SELECTIONS } from '../lib/describe';
import { useBuilderStore } from '../store/useBuilderStore';
import type { IssueSelection, IssuesConfig, ProjectChoice, WorklogsConfig } from '../types';
import { JqlField } from './JqlField';
import { PeriodField } from './PeriodField';
import { PeopleField } from './PeopleField';
import { ProjectsField } from './ProjectsField';

/** As squads de fato (a da conta, quando é ela): as pessoas delas aparecem primeiro em "De quem". */
function resolvedProjects(projectKeys: ProjectChoice, connectedSquad: string | undefined): string[] {
  if (projectKeys !== null) return projectKeys;
  return connectedSquad ? [connectedSquad] : [];
}

interface SourceFormProps<Config> {
  nodeId: string;
  config: Config;
  connectedSquad: string | undefined;
}

/** Configuração de "Horas lançadas": período, projetos, de quem e JQL a mais. */
export function WorklogsForm({ nodeId, config, connectedSquad }: SourceFormProps<WorklogsConfig>) {
  const updateConfig = useBuilderStore((state) => state.updateConfig);
  const update = (patch: Partial<WorklogsConfig>) => updateConfig<'worklogs'>(nodeId, patch);

  return (
    <>
      <PeriodField value={config.period} onChange={(period) => update({ period })} />
      <ProjectsField value={config.projectKeys} connectedSquad={connectedSquad} onChange={(projectKeys) => update({ projectKeys })} />
      <PeopleField
        label="De quem"
        allLabel="Todas as pessoas"
        meLabel="Só as minhas horas"
        value={config.people}
        projectKeys={resolvedProjects(config.projectKeys, connectedSquad)}
        onChange={(people) => update({ people })}
      />
      <JqlField value={config.jql} onChange={(jql) => update({ jql })} />
    </>
  );
}

/** Configuração de "Issues": quais (abertas, concluídas, criadas…), período, projetos, responsável e JQL a mais. */
export function IssuesForm({ nodeId, config, connectedSquad }: SourceFormProps<IssuesConfig>) {
  const updateConfig = useBuilderStore((state) => state.updateConfig);
  const update = (patch: Partial<IssuesConfig>) => updateConfig<'issues'>(nodeId, patch);
  const selectionId = useId();

  return (
    <>
      <FormField label="Quais issues" htmlFor={selectionId}>
        <select
          id={selectionId}
          className="input"
          value={config.selection}
          onChange={(event) => update({ selection: event.target.value as IssueSelection })}
        >
          {ISSUE_SELECTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FormField>
      {config.selection !== 'open' && <PeriodField value={config.period} onChange={(period) => update({ period })} />}
      <ProjectsField value={config.projectKeys} connectedSquad={connectedSquad} onChange={(projectKeys) => update({ projectKeys })} />
      <PeopleField
        label="Responsável"
        allLabel="Qualquer pessoa"
        meLabel="Só as minhas"
        value={config.assignee}
        projectKeys={resolvedProjects(config.projectKeys, connectedSquad)}
        onChange={(assignee) => update({ assignee })}
      />
      <JqlField value={config.jql} onChange={(jql) => update({ jql })} />
    </>
  );
}
