import { PencilSimple, Plus } from '@phosphor-icons/react';
import { type SyntheticEvent, useId, useState } from 'react';
import { isTokenRejected, JiraApiError, jiraReason } from '../../../api/jira-client';
import type { WorklogInput } from '../../../api/jira-worklogs';
import { useJiraWriteAccess } from '../../../api/useJiraWriteAccessQuery';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { Modal } from '../../../components/Modal';
import { Notice, ReadOnlyNotice } from '../../../components/Notice';
import { WorklogForm } from '../../../components/WorklogForm';
import { WorklogSummary } from '../../../components/WorklogSummary';
import { formatDateBR, toDateKeyInTimeZone } from '../../../lib/dates';
import { formatDuration, type TimeFormat } from '../../../lib/formatDuration';
import { isPlainClick } from '../../../lib/isPlainClick';
import type { ReportTimeZone } from '../../../lib/timeZones';
import { buildWorklogUpdate, toWorklogFormValues } from '../../../lib/worklogForm';
import { useUpdateWorklogMutation } from '../api/useUpdateWorklogMutation';
import { useLogWorkSettingsStore } from '@/store/useLogWorkSettingsStore';
import type { CellWorklog, PeriodColumn, ReportRow } from '../lib/buildReportTable';
import styles from './WorklogDialog.module.css';

interface WorklogDialogProps {
  /** Linha da issue no momento em que o modal abriu (cabeçalho). */
  row: ReportRow;
  column: PeriodColumn;
  /** Apontamentos atuais da célula: mudam quando uma edição é salva. */
  worklogs: CellWorklog[];
  timeFormat: TimeFormat;
  timeZone: ReportTimeZone;
  /** Endereço do modal da issue (Ctrl/⌘ + clique abre em outra aba). */
  issueHref: (issueKey: string) => string;
  /** Clique na chave: troca este modal pelo da issue. */
  onOpenIssue: () => void;
  /** Abre o lançamento de um horário novo nesta tarefa e neste dia. */
  onAddWorklog?: () => void;
  onClose: () => void;
}

/** 401 vem do gateway (token sem o escopo); 403, do Jira (a conta não pode editar este apontamento). */
function describeSaveError(error: Error): string {
  if (isTokenRejected(error)) return error.message;
  if (error instanceof JiraApiError && error.status === 401) {
    return `O Jira recusou a alteração: o token não tem o escopo write:jira-work. Crie um token novo com ele, clique em "Sair" e conecte com o token novo.${jiraReason(error)}`;
  }
  if (error instanceof JiraApiError && error.status === 403) {
    return `O Jira recusou a alteração: sua conta não tem permissão para editar este apontamento. Peça a quem administra o projeto a permissão de editar apontamentos (próprios ou de todos), ou confira se o status da issue não bloqueia alterações.${jiraReason(error)}`;
  }
  return error.message;
}

/** Detalhes dos apontamentos de uma célula, com edição de cada um quando o token permite. */
export function WorklogDialog({
  row,
  column,
  worklogs,
  timeFormat,
  timeZone,
  issueHref,
  onOpenIssue,
  onAddWorklog,
  onClose,
}: WorklogDialogProps) {
  const titleId = useId();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mutation = useUpdateWorklogMutation();
  const closeOnSuccess = useLogWorkSettingsStore((state) => state.closeOnSuccess);
  const setCloseOnSuccess = useLogWorkSettingsStore((state) => state.setCloseOnSuccess);
  const { canWrite: canEdit, isReadOnly } = useJiraWriteAccess();

  const total = worklogs.reduce((sum, worklog) => sum + worklog.seconds, 0);
  const count = `${worklogs.length} ${worklogs.length === 1 ? 'apontamento' : 'apontamentos'}`;

  function startEditing(id: string | null) {
    mutation.reset();
    setNotice(null);
    setEditingId(id);
  }

  // Esc durante a edição sai só da edição.
  function handleCancel(event: SyntheticEvent) {
    if (!editingId) return;
    event.preventDefault();
    startEditing(null);
  }

  async function handleSubmit(worklog: CellWorklog, input: WorklogInput | null) {
    if (!input) return startEditing(null);
    try {
      const updated = await mutation.mutateAsync({ worklog, input });
      if (useLogWorkSettingsStore.getState().closeOnSuccess) {
        onClose();
        return;
      }
      const newDay = toDateKeyInTimeZone(updated.started, timeZone);
      const moved = newDay !== toDateKeyInTimeZone(worklog.started, timeZone);
      setEditingId(null);
      setNotice(moved ? `Apontamento salvo e movido para ${formatDateBR(newDay)}.` : 'Apontamento salvo no Jira.');
    } catch {
      // O erro aparece no formulário (mutation.error).
    }
  }

  const header = (
    <>
      <p className={styles.eyebrow}>
        {column.title} · {count} · <span className={styles.total}>{formatDuration(total, timeFormat)}</span>
      </p>
      <h2 id={titleId} className={styles.title}>
        {row.iconUrl && <img src={row.iconUrl} alt="" width={16} height={16} />}
        {row.issue ? (
          <a
            className={styles.key}
            href={issueHref(row.issue.key)}
            aria-haspopup="dialog"
            onClick={(event) => {
              // Sem edição pela metade: o clique simples só troca de modal com nada sendo salvo.
              if (!isPlainClick(event)) return;
              event.preventDefault();
              if (!mutation.isPending) onOpenIssue();
            }}
          >
            {row.label}
          </a>
        ) : (
          row.label
        )}
      </h2>
      {row.secondary && <p className={styles.summary}>{row.secondary}</p>}
    </>
  );

  return (
    <Modal
      labelledBy={titleId}
      header={header}
      onClose={onClose}
      onCancel={handleCancel}
      isCloseDisabled={mutation.isPending}
      closeOnBackdrop={!editingId}
    >
      {isReadOnly && <ReadOnlyNotice action="editar apontamentos" />}
      {notice && <Notice tone="success">{notice}</Notice>}

      {worklogs.length === 0 ? (
        <p className={styles.emptyList}>Nenhum apontamento neste período.</p>
      ) : (
        <ul className={styles.list}>
          {worklogs.map((worklog) => {
            const isEditing = canEdit && worklog.id === editingId;
            // Os demais ficam bloqueados enquanto um apontamento é editado.
            const isBlocked = canEdit && editingId !== null && !isEditing;

            return (
              <li
                key={worklog.id}
                className={styles.item}
                data-editing={isEditing || undefined}
                data-blocked={isBlocked || undefined}
              >
                <div className={styles.itemHeader}>
                  <Avatar src={worklog.avatarUrl} name={worklog.author} />
                  <span className={styles.author}>{worklog.author}</span>
                  {canEdit && !isEditing && (
                    <Button
                      variant="ghost"
                      className={styles.editButton}
                      icon={<PencilSimple size={14} weight="bold" aria-hidden />}
                      disabled={editingId !== null}
                      onClick={() => startEditing(worklog.id)}
                    >
                      Editar
                    </Button>
                  )}
                </div>

                {isEditing ? (
                  <WorklogForm
                    closeOnSuccess={closeOnSuccess}
                    setCloseOnSuccess={setCloseOnSuccess}
                    initialValues={toWorklogFormValues(worklog, timeZone)}
                    validate={(values) =>
                      buildWorklogUpdate(worklog, toWorklogFormValues(worklog, timeZone), values, timeZone)
                    }
                    timeZone={timeZone}
                    timeFormat={timeFormat}
                    submitLabel="Salvar"
                    commentHint="Salva como texto simples: listas, menções e formatação do Jira viram texto."
                    isSaving={mutation.isPending}
                    saveError={mutation.error ? describeSaveError(mutation.error) : null}
                    onSubmit={(input) => void handleSubmit(worklog, input)}
                    onCancel={() => startEditing(null)}
                  />
                ) : (
                  <WorklogSummary worklog={worklog} timeZone={timeZone} timeFormat={timeFormat} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {onAddWorklog && (
        <Button
          variant="ghost"
          className={styles.addButton}
          icon={<Plus size={14} weight="bold" aria-hidden />}
          disabled={editingId !== null || mutation.isPending}
          onClick={onAddWorklog}
        >
          Adicionar
        </Button>
      )}
    </Modal>
  );
}
