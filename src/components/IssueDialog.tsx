import { ArrowSquareOut, CaretRight, CircleNotch, Plus, Sparkle } from '@phosphor-icons/react';
import { type ReactNode, type SyntheticEvent, useId, useState } from 'react';
import { Link } from 'react-router';
import type { IssuePermissions } from '../api/jira-access';
import { jiraBrowseUrl } from '../api/jira-client';
import { type IssueChanges, type JiraIssue, ownTimeTotals, sumChildrenTime, type TimeTotals } from '../api/jira-issues';
import type { WorklogInput } from '../api/jira-worklogs';
import { useChildIssuesQuery } from '../api/useChildIssuesQuery';
import { useIssueDetailsQuery, useIssueWorklogsQuery } from '../api/useIssueDetailsQuery';
import { useIssuePermissionsQuery } from '../api/useIssuePermissionsQuery';
import { useJiraWriteAccess } from '../api/useJiraWriteAccessQuery';
import { describeLogWorkError, useLogWorkMutation } from '../api/useLogWorkMutation';
import { describeIssueEditError, type EditedField, useUpdateIssueMutation } from '../api/useUpdateIssueMutation';
import { formatDateBR, isDateKey, toDateKeyInTimeZone } from '../lib/dates';
import { formatDuration } from '../lib/formatDuration';
import { isPlainClick } from '../lib/isPlainClick';
import { issueSearch } from '../lib/issueParam';
import { parentToIssue } from '../lib/parentIssue';
import type { ReportTimeZone } from '../lib/timeZones';
import { buildNewWorklog, emptyWorklogFormValues } from '../lib/worklogForm';
import { useLogWorkSettingsStore } from '@/store/useLogWorkSettingsStore';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { AiSubtaskSuggestions } from './AiSubtaskSuggestions';
import { ChildIssueList } from './ChildIssueList';
import { CreateChildIssueForm } from './CreateChildIssueForm';
import { EditableText } from './EditableText';
import { EditableUserField } from './EditableUserField';
import styles from './IssueDialog.module.css';
import { Modal } from './Modal';
import { Notice, ReadOnlyNotice } from './Notice';
import { StatusPicker } from './StatusPicker';
import { TimeTracking } from './TimeTracking';
import { WorklogForm } from './WorklogForm';
import { WorklogSummary } from './WorklogSummary';

interface IssueDialogProps {
  /**
   * O que a tela já sabe da issue (card do quadro, linha do relatório, issue
   * pai): aparece na hora, e os detalhes completos chegam em seguida.
   */
  issue: JiraIssue;
  /** Fuso dos horários dos apontamentos e do lançamento de horas. */
  timeZone: ReportTimeZone;
  /** Abre outra issue no modal (ex: a issue pai). */
  onOpenIssue: (issue: JiraIssue) => void;
  onClose: () => void;
}

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.detail}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Person({ user }: { user?: { displayName: string; avatarUrl?: string } }) {
  if (!user) return <span className={styles.muted}>Ninguém</span>;
  return (
    <span className={styles.person}>
      <Avatar src={user.avatarUrl} name={user.displayName} size={20} />
      {user.displayName}
    </span>
  );
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Detalhes de uma issue (Kanban, Reports e Metrics), com status, filhas,
 * apontamentos e o lançamento de horas. Título, descrição, responsável e relator
 * são editados no lugar (dois cliques), conforme as permissões da conta; na issue
 * pai dá para criar filhas, e o controle de tempo é a soma delas.
 */
export function IssueDialog({ issue, timeZone, onOpenIssue, onClose }: IssueDialogProps) {
  const titleId = useId();
  const closeOnSuccess = useLogWorkSettingsStore((state) => state.closeOnSuccess);
  const setCloseOnSuccess = useLogWorkSettingsStore((state) => state.setCloseOnSuccess);
  const detailsQuery = useIssueDetailsQuery(issue.key);
  const worklogsQuery = useIssueWorklogsQuery(issue.id);
  const logWork = useLogWorkMutation();
  const update = useUpdateIssueMutation();
  const { canWrite, isReadOnly } = useJiraWriteAccess();
  const permissionsQuery = useIssuePermissionsQuery(issue.key, canWrite);
  const [isLogging, setIsLogging] = useState(false);
  /** Criando filhas: o formulário ou as sugestões da IA (subtarefas de história, tarefa ou bug). */
  const [creating, setCreating] = useState<'manual' | 'ai' | null>(null);
  /** Campo em edição no lugar (um de cada vez). */
  const [editing, setEditing] = useState<EditedField | null>(null);
  const [editError, setEditError] = useState<{ field: EditedField; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Issue relida depois de trocar o status aqui (pode não estar em nenhuma lista em cache, ex: a história pai). */
  const [changed, setChanged] = useState<JiraIssue | null>(null);

  // O card do quadro já tem o essencial; os detalhes completos o substituem quando chegam.
  const details = detailsQuery.data;
  const current = details ?? issue;
  // Status: o do card do quadro (muda na hora ao arrastar ou trocar aqui); de uma
  // issue que a tela só conhece por cima (pai, linha do relatório), o dos detalhes
  // ou o da última troca feita aqui.
  const statusIssue = changed ?? (issue.status.id ? issue : details ? { ...issue, status: details.status } : null);
  const level = current.issueType.hierarchyLevel;
  const childrenQuery = useChildIssuesQuery(issue.key, level >= 0);
  // Issue pai (épico, ou com subtarefas): as horas vão nas filhas, não nela.
  const isParent = level >= 1 || (childrenQuery.data?.length ?? 0) > 0;
  // Espera saber se há filhas, para o botão não aparecer e sumir em seguida.
  const canLogWork = canWrite && !isParent && (level < 0 || !childrenQuery.isPending);
  const worklogs = worklogsQuery.data ?? [];
  const totalLogged = worklogs.reduce((sum, worklog) => sum + worklog.seconds, 0);

  // Issue pai: o tempo é a soma das filhas (cada uma com as subtarefas dela).
  const children = childrenQuery.data;
  const childTotals = isParent && children ? sumChildrenTime(children) : undefined;
  const isTotalsPending = level >= 1 && childrenQuery.isPending;
  const time: TimeTotals = childTotals ?? ownTimeTotals(current);
  /** Lançado na própria issue pai, que fica fora da soma. */
  const ownSpent = childTotals ? current.timeSpentSeconds : 0;

  /** Pelas permissões do projeto; sem a resposta (erro), deixa tentar e o Jira diz se pode. */
  function can(permission: keyof IssuePermissions): boolean {
    if (!canWrite) return false;
    return permissionsQuery.data ? permissionsQuery.data[permission] : permissionsQuery.isError;
  }
  const canCreateChild = level >= 0 && can('create');

  function startEditing(field: EditedField | null) {
    if (update.isPending) return;
    update.reset();
    setEditError(null);
    setEditing(field);
  }

  function saveField(field: EditedField, changes: IssueChanges) {
    setEditError(null);
    update.mutate(
      { issue, changes },
      {
        onSuccess: () => setEditing(null),
        onError: (error) => {
          setEditError({ field, message: describeIssueEditError(error, field) });
          // Pessoa: a lista fecha e o erro fica embaixo; texto: o formulário fica aberto com o rascunho.
          if (field === 'assignee' || field === 'reporter') setEditing(null);
        },
      },
    );
  }

  /** Props comuns dos campos editáveis no lugar. */
  function editableProps(field: EditedField) {
    return {
      isEditing: editing === field,
      onEditingChange: (isEditing: boolean) => startEditing(isEditing ? field : null),
      isSaving: update.isPending && editing === field,
      error: editError?.field === field ? editError.message : null,
    };
  }

  function startLogging(open: boolean) {
    logWork.reset();
    setNotice(null);
    setIsLogging(open);
  }

  // Esc com um formulário ou uma edição abertos fecha só eles.
  function handleCancel(event: SyntheticEvent) {
    if (isLogging) startLogging(false);
    else if (creating) setCreating(null);
    else if (editing) startEditing(null);
    else return;
    event.preventDefault();
  }

  async function handleLogWork(input: WorklogInput | null) {
    if (!input) return;
    try {
      await logWork.mutateAsync({ issue, input });
      if (useLogWorkSettingsStore.getState().closeOnSuccess) {
        onClose();
        return;
      }
      const day = toDateKeyInTimeZone(input.started, timeZone);
      setIsLogging(false);
      setNotice(`Lançadas ${formatDuration(input.seconds, 'hours-minutes')} em ${formatDateBR(day)}.`);
    } catch {
      // O erro aparece no formulário (logWork.error).
    }
  }

  const { parent } = current;
  const header = (
    <>
      <nav aria-label="Caminho da issue">
        <ol className={styles.breadcrumb}>
          {parent && (
            <li className={styles.crumbParent}>
              {/* Link de verdade (abre em outra aba com o modal do pai); o clique simples troca o modal na hora. */}
              <Link
                to={{ search: issueSearch(parent.key) }}
                className={styles.crumbLink}
                onClick={(event) => {
                  if (!isPlainClick(event)) return;
                  event.preventDefault();
                  onOpenIssue(parentToIssue(parent));
                }}
              >
                {parent.iconUrl && <img src={parent.iconUrl} alt="" width={14} height={14} />}
                <span className={styles.key}>{parent.key}</span>
              </Link>
              <CaretRight size={12} weight="bold" className={styles.crumbSeparator} aria-hidden />
            </li>
          )}
          <li className={styles.crumbCurrent} aria-current="page">
            {current.issueType.iconUrl && <img src={current.issueType.iconUrl} alt="" width={14} height={14} />}
            {current.issueType.name && (
              <>
                <span>{current.issueType.name}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span className={styles.key}>{issue.key}</span>
          </li>
        </ol>
      </nav>
      <EditableText
        value={current.summary}
        label="título"
        requiredMessage="O título não pode ficar vazio."
        canEdit={can('edit')}
        onSave={(summary) => saveField('summary', { summary })}
        {...editableProps('summary')}
      >
        <h2 id={titleId} className={styles.title}>
          {current.summary}
        </h2>
      </EditableText>
      {/* Na edição, o título continua nomeando o modal. */}
      {editing === 'summary' && (
        <h2 id={titleId} className="sr-only">
          {current.summary}
        </h2>
      )}
      <div className={styles.headerStatus}>
        {statusIssue ? (
          <StatusPicker issue={statusIssue} canChange={canWrite} onChanged={setChanged} />
        ) : (
          <span className={styles.muted}>Carregando status…</span>
        )}
        {/* Página oficial da issue no Jira. */}
        <a className={styles.jiraLink} href={jiraBrowseUrl(issue.key)} target="_blank" rel="noreferrer">
          <ArrowSquareOut size={14} weight="bold" aria-hidden />
          Abrir no Jira
          <span className="sr-only"> (nova aba)</span>
        </a>
      </div>
    </>
  );

  return (
    <Modal
      size="large"
      labelledBy={titleId}
      header={header}
      onClose={onClose}
      onCancel={handleCancel}
      isCloseDisabled={logWork.isPending || update.isPending}
      closeOnBackdrop={!isLogging && !creating && !editing}
    >
      {detailsQuery.isError && (
        <Notice tone="error">Não foi possível carregar os detalhes: {detailsQuery.error.message}</Notice>
      )}

      <dl className={styles.details}>
        <Detail label="Responsável">
          <EditableUserField
            label="responsável"
            user={current.assignee}
            source={{ kind: 'assignable', issueKey: issue.key }}
            allowNone
            canEdit={can('assign')}
            onSave={(assignee) => saveField('assignee', { assignee })}
            {...editableProps('assignee')}
          >
            <Person user={current.assignee} />
          </EditableUserField>
        </Detail>
        <Detail label="Relator">
          {details ? (
            <EditableUserField
              label="relator"
              user={details.reporter}
              source={{ kind: 'any' }}
              canEdit={can('modifyReporter')}
              onSave={(reporter) => reporter && saveField('reporter', { reporter })}
              {...editableProps('reporter')}
            >
              <Person user={details.reporter} />
            </EditableUserField>
          ) : (
            <span className={styles.muted}>…</span>
          )}
        </Detail>
        <Detail label="Prioridade">
          {current.priority ? (
            <span className={styles.person}>
              {current.priority.iconUrl && <img src={current.priority.iconUrl} alt="" width={16} height={16} />}
              {current.priority.name}
            </span>
          ) : (
            <span className={styles.muted}>Sem prioridade</span>
          )}
        </Detail>
        <Detail label="Issue pai">
          {parent ? (
            // Abre a issue pai neste mesmo modal (o link do Jira fica no cabeçalho dela).
            <button type="button" className={styles.parent} onClick={() => onOpenIssue(parentToIssue(parent))}>
              <span className={styles.parentKey}>{parent.key}</span> {parent.summary}
            </button>
          ) : (
            <span className={styles.muted}>Nenhuma</span>
          )}
        </Detail>
        {details && (
          <>
            <Detail label="Criada">{dateTimeFormatter.format(new Date(details.created))}</Detail>
            <Detail label="Atualizada">{dateTimeFormatter.format(new Date(details.updated))}</Detail>
            {details.dueDate && isDateKey(details.dueDate) && <Detail label="Prazo">{formatDateBR(details.dueDate)}</Detail>}
            {details.labels.length > 0 && (
              <Detail label="Rótulos">
                <span className={styles.labels}>
                  {details.labels.map((label) => (
                    <span key={label} className={styles.label}>
                      {label}
                    </span>
                  ))}
                </span>
              </Detail>
            )}
          </>
        )}
      </dl>

      <section className={styles.section} aria-labelledby={`${titleId}-time`}>
        <h3 id={`${titleId}-time`} className={styles.sectionTitle}>
          Controle de tempo
          {children && childTotals && (
            <span className={styles.sectionMeta}>
              {level >= 1
                ? `soma de ${plural(children.length, 'issue', 'issues')} do épico, com as subtarefas delas`
                : `soma de ${plural(children.length, 'subtarefa', 'subtarefas')}`}
            </span>
          )}
        </h3>
        <TimeTracking totals={time} isPending={isTotalsPending} />
        {ownSpent > 0 && (
          <p className={styles.hint}>
            A própria issue tem mais {formatDuration(ownSpent, 'hours-minutes')} lançadas, fora da soma.
          </p>
        )}
      </section>

      <section className={styles.section} aria-labelledby={`${titleId}-description`}>
        <h3 id={`${titleId}-description`} className={styles.sectionTitle}>
          Descrição
        </h3>
        {!details ? (
          <p className={styles.muted}>{detailsQuery.isError ? '—' : 'Carregando…'}</p>
        ) : (
          <EditableText
            value={details.description}
            label="descrição"
            multiline
            canEdit={can('edit')}
            onSave={(description) => saveField('description', { description })}
            hint="A descrição é salva como texto simples: negrito, listas, links e imagens da descrição atual se perdem."
            {...editableProps('description')}
          >
            {details.description ? (
              <p className={styles.description}>{details.description}</p>
            ) : (
              <p className={styles.empty}>Sem descrição</p>
            )}
          </EditableText>
        )}
      </section>

      <ChildIssueList
        query={childrenQuery}
        hierarchyLevel={level}
        headingId={`${titleId}-children`}
        className={styles.section}
        onOpenIssue={onOpenIssue}
        canChangeStatus={canWrite}
        showWhenEmpty={canCreateChild}
        action={
          canCreateChild &&
          !creating && (
            <div className={styles.childActions}>
              {level === 0 && (
                <Button
                  icon={<Sparkle size={14} weight="fill" />}
                  onClick={() => setCreating('ai')}
                  className={styles.logButton}
                  title="A IA lê a história e sugere as subtarefas, para você conferir e criar"
                >
                  Sugerir com IA
                </Button>
              )}
              <Button icon={<Plus size={14} weight="bold" />} onClick={() => setCreating('manual')} className={styles.logButton}>
                {level >= 1 ? 'Criar issue' : 'Criar subtarefa'}
              </Button>
            </div>
          )
        }
        form={
          creating === 'ai' ? (
            <AiSubtaskSuggestions
              parentKey={issue.key}
              parentType={current.issueType.name}
              summary={current.summary}
              description={details?.description}
              originalEstimateSeconds={current.originalEstimateSeconds}
              existing={children?.map((child) => child.summary)}
              defaultAssignee={current.assignee ?? null}
              onClose={() => setCreating(null)}
            />
          ) : (
            creating === 'manual' && (
              <CreateChildIssueForm
                parentKey={issue.key}
                childLevel={level >= 1 ? 0 : -1}
                defaultAssignee={level >= 1 ? null : (current.assignee ?? null)}
                onClose={() => setCreating(null)}
              />
            )
          )
        }
      />

      <section className={styles.section} aria-labelledby={`${titleId}-worklogs`}>
        <div className={styles.sectionHeader}>
          <h3 id={`${titleId}-worklogs`} className={styles.sectionTitle}>
            Apontamentos
            {worklogsQuery.data && (
              <span className={styles.sectionMeta}>
                {worklogs.length} · {formatDuration(totalLogged, 'hours-minutes') || '0h 00m'}
              </span>
            )}
          </h3>
          {canLogWork && !isLogging && (
            <Button variant="primary" icon={<Plus size={14} weight="bold" />} onClick={() => startLogging(true)} className={styles.logButton}>
              Lançar horas
            </Button>
          )}
        </div>

        {isParent && canWrite && (
          <p className={styles.hint}>
            As horas são lançadas {level >= 1 ? 'nas issues do épico' : 'nas subtarefas'}, não na issue pai.
          </p>
        )}
        {isReadOnly && <ReadOnlyNotice action={isParent ? 'trocar o status' : 'lançar horas e trocar o status'} />}
        {notice && <Notice tone="success">{notice}</Notice>}

        {isLogging && (
          <div className={styles.logForm}>
            <WorklogForm
              closeOnSuccess={closeOnSuccess}
              setCloseOnSuccess={setCloseOnSuccess}
              initialValues={emptyWorklogFormValues(timeZone)}
              validate={(values) => buildNewWorklog(values, timeZone)}
              timeZone={timeZone}
              timeFormat="hours-minutes"
              submitLabel="Lançar"
              isSaving={logWork.isPending}
              saveError={logWork.error ? describeLogWorkError(logWork.error) : null}
              onSubmit={(input) => void handleLogWork(input)}
              onCancel={() => startLogging(false)}
            />
          </div>
        )}

        {worklogsQuery.isPending ? (
          <p className={styles.loading}>
            <CircleNotch size={14} weight="bold" className={styles.spinner} aria-hidden /> Carregando apontamentos…
          </p>
        ) : worklogsQuery.isError ? (
          <Notice tone="error">Não foi possível carregar os apontamentos: {worklogsQuery.error.message}</Notice>
        ) : worklogs.length === 0 ? (
          <p className={styles.empty}>Nenhuma hora lançada nesta issue.</p>
        ) : (
          <ul className={styles.worklogs}>
            {worklogs.map((worklog) => (
              <li key={worklog.id} className={styles.worklog}>
                <p className={styles.worklogAuthor}>
                  <Avatar src={worklog.avatarUrl} name={worklog.author} />
                  {worklog.author}
                </p>
                <WorklogSummary worklog={worklog} timeZone={timeZone} timeFormat="hours-minutes" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Modal>
  );
}
