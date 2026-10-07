/** Parâmetro do endereço com a issue aberta no modal: `/kanban?issue=CLI-5151`. */
export const ISSUE_PARAM = 'issue';

/**
 * Query do endereço com a issue aberta (ou nenhuma, com `null`). Só a issue:
 * os filtros de um link compartilhado do relatório já foram aplicados e tirados
 * do endereço (por fora do router, que ainda os teria), e não devem voltar.
 */
export function issueSearch(issueKey: string | null): string {
  return issueKey ? `?${new URLSearchParams({ [ISSUE_PARAM]: issueKey })}` : '';
}
