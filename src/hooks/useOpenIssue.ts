import { useCallback, useEffect, useState } from 'react';
import { useHref, useLocation, useNavigate, useSearchParams } from 'react-router';
import { isIssueKey, type JiraIssue } from '../api/jira-issues';
import { useIssueByKeyQuery } from '../api/useIssueByKeyQuery';
import { ISSUE_PARAM, issueSearch } from '../lib/issueParam';

/**
 * Issue aberta no modal, guardada no endereço (`/kanban?issue=CLI-5151`):
 * recarregar a página ou abrir o link reabre o mesmo modal.
 *
 * `knownIssues` são as issues que a tela já tem (ex: os cards do quadro): o
 * modal acompanha a versão delas (status mudou depois de arrastar). Senão vale
 * a issue clicada e, sem ela (página recarregada), a issue vem da API pela chave.
 */
export function useOpenIssue(knownIssues?: JiraIssue[]) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const paramKey = searchParams.get(ISSUE_PARAM)?.trim().toUpperCase();
  const openKey = isIssueKey(paramKey) ? paramKey : null;
  /** A issue clicada, para o modal abrir na hora (ex: a história pai, que não é um card). */
  const [clicked, setClicked] = useState<JiraIssue | null>(null);
  /** Issue do endereço que não abriu (não existe ou sem acesso). */
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  // Troca a issue do endereço sem criar entrada no histórico (voltar sai da tela, não reabre modais).
  // `navigate` só muda com o caminho: abrir e fechar não recriam `open`/`close` (as linhas da tabela não re-renderizam).
  const setOpenKey = useCallback(
    (issueKey: string | null) => void navigate({ search: issueSearch(issueKey) }, { replace: true }),
    [navigate],
  );
  const open = useCallback(
    (issue: JiraIssue) => {
      setClicked(issue);
      setFailure(null);
      setOpenKey(issue.key);
    },
    [setOpenKey],
  );
  const close = useCallback(() => {
    setClicked(null);
    setOpenKey(null);
  }, [setOpenKey]);

  const knownIssue = openKey ? knownIssues?.find((issue) => issue.key === openKey) : undefined;
  const clickedIssue = clicked && clicked.key === openKey ? clicked : undefined;
  const issueByKeyQuery = useIssueByKeyQuery(openKey, !knownIssue && !clickedIssue);
  const issue = knownIssue ?? clickedIssue ?? issueByKeyQuery.data;

  // Chave do endereço que a API não achou (e a tela não tem): avisa e tira do endereço.
  const openError = issue ? null : issueByKeyQuery.error;
  useEffect(() => {
    if (!openKey || !openError) return;
    setFailure({ key: openKey, message: openError.message });
    setOpenKey(null);
  }, [openKey, openError, setOpenKey]);

  // Link de cada issue (Ctrl/⌘ + clique abre em outra aba, com o modal aberto).
  const { pathname } = useLocation();
  const base = useHref(pathname);
  const hrefFor = useCallback((issueKey: string) => `${base}${issueSearch(issueKey)}`, [base]);

  return { issue, open, close, failure, hrefFor };
}
