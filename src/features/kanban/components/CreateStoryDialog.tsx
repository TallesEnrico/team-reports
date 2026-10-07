import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import type { CreatedIssue, EpicOption, IssueTypeOption } from '../../../api/jira-issues';
import { useCreateFieldsQuery } from '../../../api/useCreateFieldsQuery';
import { describeCreateIssueError, useCreateIssueMutation } from '../../../api/useCreateChildIssueMutation';
import { useCurrentUserQuery } from '../../../api/useCurrentUserQuery';
import { Button } from '../../../components/Button';
import { ChildIssueFields } from '../../../components/ChildIssueFields';
import { createdMessage } from '../../../components/CreateChildIssueForm';
import { FormField } from '../../../components/FormField';
import { Modal } from '../../../components/Modal';
import { Notice } from '../../../components/Notice';
import { type ChildDraft, draftToNewIssue, emptyDraft, validateDraft } from '../../../lib/subtaskDraft';
import { EpicPicker } from './EpicPicker';
import styles from './CreateStoryDialog.module.css';

interface CreateStoryDialogProps {
  projectKey: string;
  /** Tipos de história que a conta pode criar neste projeto. */
  storyTypes: IssueTypeOption[];
  onClose: () => void;
}

/**
 * Cria uma história na squad. Depois de criar, o formulário fica aberto para a
 * próxima, com o mesmo tipo, relator, responsável, atividade e épico.
 */
export function CreateStoryDialog({ projectKey, storyTypes, onClose }: CreateStoryDialogProps) {
  const titleId = useId();
  const epicId = useId();
  const { data: me } = useCurrentUserQuery();
  const create = useCreateIssueMutation();
  const [draft, setDraft] = useState<ChildDraft>(() => emptyDraft());
  const [parent, setParent] = useState<EpicOption | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [created, setCreated] = useState<CreatedIssue[]>([]);
  const [round, setRound] = useState(0);
  const seededAssignee = useRef(false);

  useEffect(() => {
    if (!me || seededAssignee.current) return;
    seededAssignee.current = true;
    setDraft((previous) => (previous.assignee ? previous : { ...previous, assignee: me }));
  }, [me]);

  const issueTypeId = storyTypes.some((type) => type.id === draft.issueTypeId) ? draft.issueTypeId : (storyTypes[0]?.id ?? '');
  const fieldsQuery = useCreateFieldsQuery(projectKey, issueTypeId || undefined);
  const fields = fieldsQuery.data;
  const parentField = fields?.find((field) => field.fieldId === 'parent');
  const current: ChildDraft = { ...draft, issueTypeId, reporter: draft.reporter ?? me ?? null };
  const errors = validateDraft(current, fields);
  const parentError = parentField?.required && !parent ? 'Escolha o épico.' : undefined;
  const isReady = Boolean(issueTypeId) && (fieldsQuery.isSuccess || fieldsQuery.isError);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isReady || create.isPending) return;
    if (Object.keys(errors).length > 0 || parentError) {
      setShowErrors(true);
      return;
    }
    try {
      const result = await create.mutateAsync({
        projectKey,
        parentKey: parentField && parent ? parent.key : undefined,
        input: draftToNewIssue(current, fields, me?.accountId),
      });
      setCreated((previous) => [...previous, result]);
      setDraft((previous) => ({ ...previous, summary: '', description: '', estimate: '' }));
      setShowErrors(false);
      setRound((value) => value + 1);
    } catch {
      // O erro aparece no formulário (create.error).
    }
  }

  return (
    <Modal
      size="large"
      labelledBy={titleId}
      onClose={onClose}
      isCloseDisabled={create.isPending}
      header={
        <div className={styles.titles}>
          <h2 id={titleId} className={styles.title}>
            Criar história
          </h2>
          <p className={styles.subtitle}>A história entra na squad {projectKey}.</p>
        </div>
      }
    >
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
        {parentField && (
          <FormField
            label="Épico"
            htmlFor={epicId}
            hint={
              showErrors && parentError ? (
                <span className={styles.error} role="alert">
                  {parentError}
                </span>
              ) : undefined
            }
          >
            <EpicPicker
              projectKey={projectKey}
              inputId={epicId}
              value={parent}
              onChange={setParent}
              isDisabled={create.isPending}
              isClearable={!parentField.required}
              autoFocus={parentField.required}
            />
          </FormField>
        )}
        <ChildIssueFields
          key={round}
          projectKey={projectKey}
          draft={current}
          onChange={(patch) => setDraft((previous) => ({ ...previous, ...patch }))}
          types={storyTypes}
          fields={fields}
          errors={showErrors ? errors : undefined}
          disabled={create.isPending}
          autoFocus={!parentField?.required}
          noun="história"
        />
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
            {create.isPending ? 'Criando…' : 'Criar história'}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Fechar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
