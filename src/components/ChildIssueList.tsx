import { CircleNotch } from '@phosphor-icons/react';
import { type ReactNode, useState } from 'react';
import type { JiraIssue } from '../api/jira-issues';
import type { useChildIssuesQuery } from '../api/useChildIssuesQuery';
import { cx } from '../lib/cx';
import { Avatar } from './Avatar';
import { Notice } from './Notice';
import styles from './ChildIssueList.module.css';
import { StatusPicker } from './StatusPicker';

interface ChildIssueListProps {
  /** Busca das filhas, feita pelo modal (que também decide se mostra "Lançar horas"). */
  query: ReturnType<typeof useChildIssuesQuery>;
  /** 1 = épico (filhas são issues); 0 = história, tarefa, bug (filhas são subtarefas). */
  hierarchyLevel: number;
  headingId: string;
  /** Classe de seção do modal, para as divisórias entre seções valerem aqui também. */
  className?: string;
  /** Clique numa filha: abre ela no modal. */
  onOpenIssue: (issue: JiraIssue) => void;
  /** O status de cada filha troca ali mesmo (sem o escopo de escrita, só aparece). */
  canChangeStatus: boolean;
  /** Ao lado do título (ex: o botão de criar filha). */
  action?: ReactNode;
  /** Abaixo do título (ex: o formulário de criar filha). */
  form?: ReactNode;
  /** Mostra a seção mesmo sem filhas (ex: quando dá para criar a primeira). */
  showWhenEmpty?: boolean;
}

/** Subtarefas da issue (ou issues do épico), com o status de cada uma. Sem nenhuma, some (a não ser com `showWhenEmpty`). */
export function ChildIssueList({
  query,
  hierarchyLevel,
  headingId,
  className,
  onOpenIssue,
  canChangeStatus,
  action,
  form,
  showWhenEmpty = false,
}: ChildIssueListProps) {
  const children = query.data ?? [];
  const title = hierarchyLevel >= 1 ? 'Issues do épico' : 'Subtarefas';

  if (hierarchyLevel < 0 || (query.isSuccess && children.length === 0 && !showWhenEmpty)) return null;

  const doneCount = children.filter((child) => child.status.categoryKey === 'done').length;

  return (
    <section className={className} aria-labelledby={headingId}>
      <div className={styles.header}>
        <h3 id={headingId} className={styles.title}>
          {title}
          {query.isSuccess && children.length > 0 && (
            <span className={styles.meta}>
              {doneCount} de {children.length} {children.length === 1 ? 'concluída' : 'concluídas'}
            </span>
          )}
        </h3>
        {action}
      </div>
      {form}

      {query.isPending ? (
        <p className={styles.loading}>
          <CircleNotch size={14} weight="bold" className={styles.spinner} aria-hidden /> Carregando {title.toLowerCase()}…
        </p>
      ) : query.isError ? (
        <Notice tone="error">Não foi possível carregar as {title.toLowerCase()}: {query.error.message}</Notice>
      ) : children.length === 0 ? (
        <p className={styles.empty}>{hierarchyLevel >= 1 ? 'Nenhuma issue no épico.' : 'Nenhuma subtarefa.'}</p>
      ) : (
        <ul className={styles.list}>
          {children.map((child) => (
            <ChildIssueRow key={child.id} child={child} canChangeStatus={canChangeStatus} onOpenIssue={onOpenIssue} />
          ))}
        </ul>
      )}
    </section>
  );
}

interface ChildIssueRowProps {
  child: JiraIssue;
  canChangeStatus: boolean;
  onOpenIssue: (issue: JiraIssue) => void;
}

/** Uma filha: chave e título abrem ela no modal; o status troca ali mesmo, e um erro aparece embaixo da linha. */
function ChildIssueRow({ child, canChangeStatus, onOpenIssue }: ChildIssueRowProps) {
  const [statusError, setStatusError] = useState<string | null>(null);
  const isDone = child.status.categoryKey === 'done';

  return (
    <li className={styles.row}>
      <button type="button" className={styles.item} onClick={() => onOpenIssue(child)}>
        {child.issueType.iconUrl && (
          <img src={child.issueType.iconUrl} alt={child.issueType.name} title={child.issueType.name} width={16} height={16} />
        )}
        <span className={cx(styles.key, isDone && styles.done)}>{child.key}</span>
        <span className={styles.summary}>{child.summary}</span>
      </button>
      <StatusPicker issue={child} canChange={canChangeStatus} align="end" onErrorChange={setStatusError} />
      {child.assignee ? (
        <Avatar src={child.assignee.avatarUrl} name={child.assignee.displayName} size={22} showTitle />
      ) : (
        <span className={styles.unassigned} title="Sem responsável" />
      )}
      {statusError && (
        <p role="alert" className={styles.rowError}>
          {statusError}
        </p>
      )}
    </li>
  );
}
