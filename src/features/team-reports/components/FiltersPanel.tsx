import { ArrowClockwise, WarningCircle } from '@phosphor-icons/react';
import { type FormEvent, useEffect, useId, useMemo } from 'react';
import { Button } from '../../../components/Button';
import { FormField } from '../../../components/FormField';
import { MultiSelect } from '../../../components/MultiSelect';
import { cx } from '../../../lib/cx';
import { useJiraFieldsQuery } from '../api/useJiraFieldsQuery';
import { useProjectsQuery } from '../../../api/useProjectsQuery';
import { useRefreshWorklogReport } from '../api/useRefreshWorklogReport';
import { type AutoApplyStatus, useAutoApplyFilters } from '../hooks/useAutoApplyFilters';
import { buildReportJql } from '../lib/buildReportJql';
import { validateFilters } from '../lib/validateFilters';
import { useReportFiltersStore } from '../store/useReportFiltersStore';
import type { JiraField } from '../types';
import { DateRangeFields } from './DateRangeFields';
import styles from './FiltersPanel.module.css';
import { UserGroupPicker } from './UserGroupPicker';
import { toDateKey } from '@/lib/dates';

interface ValueOption {
  value: string;
  label: string;
}

interface FieldOption extends ValueOption {
  field: JiraField;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

type RefreshState = Exclude<AutoApplyStatus, 'off'> | 'refreshing';

const REFRESH_LABEL: Record<RefreshState, string> = {
  synced: 'Atualizar',
  pending: 'Aplicando alterações…',
  refreshing: 'Atualizando…',
  invalid: 'Corrija os filtros para atualizar',
};

export function FiltersPanel() {
  const draft = useReportFiltersStore((state) => state.draft);
  const applied = useReportFiltersStore((state) => state.applied);
  const setDraft = useReportFiltersStore((state) => state.setDraft);
  const applyDraft = useReportFiltersStore((state) => state.applyDraft);
  const autoApply = useAutoApplyFilters();
  const reportRefresh = useRefreshWorklogReport();

  const projectsQuery = useProjectsQuery();
  const fieldsQuery = useJiraFieldsQuery();

  const projectsId = useId();
  const principalsId = useId();
  const fieldsId = useId();
  const jqlId = useId();

  const validationError = validateFilters(draft);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const date = searchParams.get('date');
    if (!date) return;
    setDraft({
      from: toDateKey(new Date(date)),
      to: toDateKey(new Date(date)),
    });
    searchParams.delete('date');
    const search = searchParams.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}`);
  }, [setDraft]);

  const projectOptions = useMemo<ValueOption[]>(
    () => (projectsQuery.data ?? []).map((project) => ({ value: project.key, label: `${project.name} (${project.key})` })),
    [projectsQuery.data],
  );
  const fieldOptions = useMemo<FieldOption[]>(
    () => (fieldsQuery.data ?? []).map((field) => ({ value: field.id, label: field.name, field })),
    [fieldsQuery.data],
  );

  // Enquanto as listas carregam, os valores já salvos aparecem pelo id.
  const selectedProjects = draft.projectKeys.map(
    (key) => projectOptions.find((option) => option.value === key) ?? { value: key, label: key },
  );
  const selectedFields = draft.additionalFieldIds.map(
    (id) =>
      fieldOptions.find((option) => option.value === id) ?? { value: id, label: id, field: { id, name: id, custom: false } },
  );

  // Botão (1ª vez) ou ⌘/Ctrl+Enter no JQL: aplica na hora, sem esperar o debounce.
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validationError) applyDraft();
  }

  const refreshState: RefreshState | null =
    autoApply === 'off' ? null : reportRefresh.isRefreshing ? 'refreshing' : autoApply;

  // Com mudança pendente, aplica já (sem esperar o debounce); em sincronia,
  // busca os mesmos filtros de novo no Jira.
  function handleRefresh() {
    if (refreshState === 'refreshing') return;
    if (refreshState === 'pending') applyDraft();
    else void reportRefresh.refresh();
  }

  return (
    <form className={styles.panel} onSubmit={handleSubmit} aria-label="Filtros do relatório">
      <DateRangeFields from={draft.from} to={draft.to} onChange={setDraft} />

      <FormField label="Projetos" htmlFor={projectsId} hint={projectsQuery.isError ? 'Não foi possível carregar os projetos.' : undefined}>
        <MultiSelect<ValueOption>
          inputId={projectsId}
          placeholder="Todos os projetos"
          options={projectOptions}
          value={selectedProjects}
          isLoading={projectsQuery.isLoading}
          onChange={(selected) => setDraft({ projectKeys: selected.map((option) => option.value) })}
          formatOptionLabel={(option, { context }) => (context === 'value' ? option.value : option.label)}
        />
      </FormField>

      <FormField label="Pessoas e grupos" htmlFor={principalsId} hint="Vazio considera todas pessoas.">
        <UserGroupPicker inputId={principalsId} value={draft.principals} onChange={(principals) => setDraft({ principals })} />
      </FormField>

      <FormField label="Campos adicionais" htmlFor={fieldsId}>
        <MultiSelect<FieldOption>
          inputId={fieldsId}
          placeholder="Nenhum"
          options={fieldOptions}
          value={selectedFields}
          isLoading={fieldsQuery.isLoading}
          onChange={(selected) => setDraft({ additionalFieldIds: selected.map((option) => option.value) })}
          formatOptionLabel={(option, { context }) =>
            context === 'value' || !option.field.custom ? (
              option.label
            ) : (
              <span className={styles.fieldOption}>
                {option.label}
                <span className={styles.fieldId}>{option.value}</span>
              </span>
            )
          }
        />
      </FormField>

      <FormField
        label="Filtro JQL"
        htmlFor={jqlId}
        hint={
          <>
            Combinado com os filtros. <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd> <kbd>Enter</kbd> aplica.
          </>
        }
      >
        <textarea
          id={jqlId}
          className="input"
          rows={3}
          spellCheck={false}
          placeholder='issuetype = Subtarefa AND status != "Cancelado"'
          value={draft.jql}
          onChange={(event) => setDraft({ jql: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
      </FormField>

      {validationError && (
        <p className={styles.error} role="alert">
          <WarningCircle size={16} weight="bold" aria-hidden />
          {validationError}
        </p>
      )}

      {refreshState === null ? (
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={Boolean(validationError)}>
            Gerar relatório
          </Button>
          <p className={styles.actionsHint}>Depois de gerar, cada mudança nos filtros atualiza o relatório sozinha.</p>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button
            className={cx(styles.refreshButton, styles[refreshState])}
            onClick={handleRefresh}
            disabled={refreshState === 'invalid'}
            aria-busy={refreshState === 'refreshing'}
            title="Atualização automática ativa: os filtros se aplicam sozinhos. Clique para buscar os dados de novo no Jira."
          >
            <span className={styles.autoApplyDot} aria-hidden />
            <span className={styles.refreshLabel}>{REFRESH_LABEL[refreshState]}</span>
            <ArrowClockwise size={16} weight="bold" className={styles.refreshIcon} aria-hidden />
          </Button>
          <span className="sr-only" role="status">
            {REFRESH_LABEL[refreshState]}
          </span>
        </div>
      )}

      <details className={styles.jqlDetails}>
        <summary>{applied ? 'JQL do relatório atual' : 'JQL que será usada'}</summary>
        <code>{buildReportJql(applied ?? draft)}</code>
      </details>
    </form>
  );
}
