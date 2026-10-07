import { type FormEvent, useState } from 'react';
import { type CreatedIssue, projectKeyOf } from '../api/jira-issues';
import type { JiraUser } from '../api/jira-users';
import { useCreatableIssueTypesQuery } from '../api/useCreatableIssueTypesQuery';
import { describeCreateIssueError, useCreateChildIssueMutation } from '../api/useCreateChildIssueMutation';
import { useCreateFieldsQuery } from '../api/useCreateFieldsQuery';
import { useCurrentUserQuery } from '../api/useCurrentUserQuery';
import { type ChildDraft, draftToNewIssue, emptyDraft, validateDraft } from '../lib/subtaskDraft';
import { Button } from './Button';
import { ChildIssueFields } from './ChildIssueFields';
import styles from './CreateChildIssueForm.module.css';
import { Notice } from './Notice';

interface CreateChildIssueFormProps {
  parentKey: string;
  /** Nível das filhas: -1 subtarefa (a pai é história, tarefa ou bug), 0 issue do épico. */
  childLevel: number;
  /** Responsável que já vem escolhido (o da issue pai). */
  defaultAssignee?: JiraUser | null;
  onClose: () => void;
}

/** "Criada: CLI-12." / "Criadas: CLI-12, CLI-13.", com o que o Jira não aceitou depois de criar. */
export function createdMessage(created: CreatedIssue[]): string {
  const keys = created.map((issue) => issue.key);
  const head = keys.length === 1 ? `Criada: ${keys[0]}.` : `Criadas: ${keys.join(', ')}.`;
  const skipped = created.filter((issue) => issue.skipped.length > 0);
  const tail = skipped.map((issue) => ` Em ${issue.key}, o Jira não aceitou ${issue.skipped.join(', ')} (fora das telas de criação e de edição do projeto).`);
  return head + tail.join('');
}

/**
 * Cria filhas da issue pai, uma de cada vez: depois de criar, o formulário fica
 * aberto (com o mesmo tipo, relator, responsável e atividade) para a próxima.
 */
export function CreateChildIssueForm({ parentKey, childLevel, defaultAssignee = null, onClose }: CreateChildIssueFormProps) {
  const projectKey = projectKeyOf(parentKey);
  const typesQuery = useCreatableIssueTypesQuery(projectKey, true);
  const { data: me } = useCurrentUserQuery();
  const create = useCreateChildIssueMutation();
  const [draft, setDraft] = useState<ChildDraft>(() => emptyDraft({ assignee: defaultAssignee }));
  const [showErrors, setShowErrors] = useState(false);
  const [created, setCreated] = useState<CreatedIssue[]>([]);
  // Muda a cada filha criada: os campos recomeçam com o foco no título.
  const [round, setRound] = useState(0);

  const types = (typesQuery.data ?? []).filter((type) => type.hierarchyLevel === childLevel);
  const issueTypeId = types.some((type) => type.id === draft.issueTypeId) ? draft.issueTypeId : (types[0]?.id ?? '');
  const fieldsQuery = useCreateFieldsQuery(projectKey, issueTypeId || undefined);
  // Sem escolha, o relator é quem cria (o padrão do Jira).
  const current: ChildDraft = { ...draft, issueTypeId, reporter: draft.reporter ?? me ?? null };
  const fields = fieldsQuery.data;
  const errors = validateDraft(current, fields);
  const noun = childLevel < 0 ? 'subtarefa' : 'issue';
  // Sem a tela de criação (erro ao buscar), deixa tentar: o Jira diz o que falta.
  const isReady = Boolean(issueTypeId) && (fieldsQuery.isSuccess || fieldsQuery.isError);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isReady || create.isPending) return;
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    try {
      const result = await create.mutateAsync({ parentKey, input: draftToNewIssue(current, fields, me?.accountId) });
      setCreated((previous) => [...previous, result]);
      setDraft((previous) => ({ ...previous, summary: '', description: '', estimate: '' }));
      setShowErrors(false);
      setRound((value) => value + 1);
    } catch {
      // O erro aparece no formulário (create.error).
    }
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      onKeyDown={(event) => {
        // Esc fecha só o formulário (sem isto, fecharia o modal); com uma lista aberta, ela trata o Esc.
        if (event.key === 'Escape' && !event.defaultPrevented && !create.isPending) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      {typesQuery.isPending ? (
        <p className={styles.muted}>Carregando os tipos…</p>
      ) : typesQuery.isError ? (
        <Notice tone="error">Não foi possível carregar os tipos de issue: {typesQuery.error.message}</Notice>
      ) : types.length === 0 ? (
        <Notice tone="warning">
          Sua conta não pode criar {childLevel < 0 ? 'subtarefas' : 'issues'} no projeto {projectKey}.
        </Notice>
      ) : (
        <ChildIssueFields
          key={round}
          projectKey={projectKey}
          draft={current}
          onChange={(patch) => setDraft((previous) => ({ ...previous, ...patch }))}
          types={types}
          fields={fields}
          errors={showErrors ? errors : undefined}
          disabled={create.isPending}
          autoFocus
          noun={noun}
        />
      )}
      {fieldsQuery.isError && (
        <Notice tone="warning">
          Não foi possível ler a tela de criação do projeto ({fieldsQuery.error.message}). Dá para criar, e o Jira diz se faltar
          algum campo.
        </Notice>
      )}

      {create.error && <Notice tone="error">{describeCreateIssueError(create.error)}</Notice>}
      {created.length > 0 && (
        <Notice tone={created.some((issue) => issue.skipped.length > 0) ? 'warning' : 'success'}>
          {createdMessage(created)} Preencha a próxima ou feche.
        </Notice>
      )}

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={!isReady || create.isPending}>
          {create.isPending ? 'Criando…' : `Criar ${noun}`}
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
          Fechar
        </Button>
      </div>
    </form>
  );
}
