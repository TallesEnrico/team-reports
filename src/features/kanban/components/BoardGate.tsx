import { CircleNotch, Kanban, LockKey, PlugsConnected, WarningCircle } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { isTokenRejected, JiraApiError } from '../../../api/jira-client';
import { PageMessage } from '../../../components/PageMessage';
import { useIsJiraConnected } from '../../../store/useJiraConnectionStore';
import type { useKanbanBoard } from '../hooks/useKanbanBoard';
import { ME } from '../types';
import styles from './BoardGate.module.css';

/** Escopos que a API de quadros (Agile) exige, além dos de leitura do relatório. */
const BOARD_SCOPES = ['read:board-scope:jira-software', 'read:board-scope.admin:jira-software', 'read:project:jira'];

/** Recusa por escopo (ou permissão); token que não vale mais tem a própria mensagem. */
function isMissingScope(error: unknown): boolean {
  return error instanceof JiraApiError && (error.status === 401 || error.status === 403) && !isTokenRejected(error);
}

interface BoardGateProps {
  board: ReturnType<typeof useKanbanBoard>;
  /** Nome da tela nas mensagens ("Kanban", "Spreadsheet"). */
  toolName: string;
  /** Colunas, cards e preferências salvas prontos. */
  isReady: boolean;
  /** Cards das pessoas escolhidas no quadro, sem os filtros da lateral. */
  totalCount: number;
  /** Sem nenhum card: o "Carregar mais" das concluídas (as mais antigas podem ter cards). */
  loadMore?: ReactNode;
  /** O quadro ou a planilha, quando há o que mostrar. */
  children: () => ReactNode;
}

/**
 * Estados das telas do quadro (Kanban e Spreadsheet) antes de haver o que
 * mostrar: sem conta, token sem os escopos de quadro, erro, squad sem quadro,
 * nenhum card das pessoas escolhidas e carregando. Com tudo pronto, `children`.
 */
export function BoardGate({ board: kanban, toolName, isReady, totalCount, loadMore, children }: BoardGateProps) {
  const isConnected = useIsJiraConnected();
  const onlyMe = kanban.assignees.length === 1 && kanban.assignees[0] === ME;
  const everyone = kanban.assignees.length === 0;
  const boardName = kanban.board?.name;

  if (!isConnected || !kanban.projectKey) {
    return (
      <PageMessage tone="neutral" icon={<PlugsConnected size={20} weight="bold" />} title="Conecte sua conta do Jira">
        O quadro da squad aparece assim que a conexão for concluída.
      </PageMessage>
    );
  }
  if (isMissingScope(kanban.boardsQuery.error ?? kanban.configurationQuery.error)) {
    return (
      <PageMessage tone="error" icon={<LockKey size={20} weight="bold" />} title="O token não tem acesso aos quadros do Jira">
        <p>
          O {toolName} usa a API de quadros, que pede escopos além dos do relatório. Crie um token de API com os escopos
          atuais mais estes, clique em "Sair", na lateral, e conecte com o token novo:
        </p>
        <ul className={styles.scopes}>
          {BOARD_SCOPES.map((scope) => (
            <li key={scope}>
              <code>{scope}</code>
            </li>
          ))}
        </ul>
      </PageMessage>
    );
  }
  if (kanban.error) {
    const messages = kanban.error instanceof JiraApiError ? kanban.error.messages : [kanban.error.message];
    return (
      <PageMessage tone="error" icon={<WarningCircle size={20} weight="bold" />} title="Não foi possível carregar o quadro">
        <ul>
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </PageMessage>
    );
  }
  if (kanban.boardsQuery.isSuccess && kanban.boards.length === 0) {
    return (
      <PageMessage tone="neutral" icon={<Kanban size={20} weight="bold" />} title={`Nenhum quadro na squad ${kanban.projectKey}`}>
        Crie um quadro no Jira para esta squad, ou escolha outra squad na lateral.
      </PageMessage>
    );
  }
  if (isReady && totalCount === 0) {
    return (
      <PageMessage
        tone="neutral"
        icon={<Kanban size={20} weight="bold" />}
        title={
          everyone
            ? 'Nenhum card neste quadro'
            : onlyMe
              ? 'Nenhum card seu neste quadro'
              : 'Nenhum card das pessoas escolhidas neste quadro'
        }
      >
        <p>
          {everyone
            ? `O ${toolName} mostra as issues do quadro ${boardName}, de qualquer responsável.`
            : `O ${toolName} mostra só as issues atribuídas ${onlyMe ? 'a você' : 'às pessoas escolhidas em "Pessoas"'} no quadro ${boardName}.`}
        </p>
        {loadMore && <div className={styles.loadMore}>{loadMore}</div>}
      </PageMessage>
    );
  }
  if (!isReady) {
    return (
      <PageMessage tone="loading" icon={<CircleNotch size={20} weight="bold" />} title="Carregando o quadro">
        Colunas e cards do quadro {boardName ?? `da squad ${kanban.projectKey}`}.
      </PageMessage>
    );
  }
  return children();
}
