import type { JiraIssue } from '../../../api/jira-issues';
import type { IssuesToLog } from '../api/issues-to-log-api';

export interface MatchedIssues {
  issues: JiraIssue[];
  /** Issues pai que passam na pesquisa, mas ficam fora da lista. */
  hiddenParents: number;
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Pesquisa por número, chave ou resumo, sem acento e sem diferenciar
 * maiúsculas: "5151" ou "cli-5151" acham CLI-5151, e "515" acha também
 * CLI-5152. Todas as palavras precisam aparecer (na chave ou no resumo).
 * A chave exata vem primeiro, depois quem tem o termo na chave, depois o
 * resto, cada grupo na ordem original. Sem termo, devolve tudo. Concluídas
 * (ex: pelo seletor de status, depois da busca) saem da lista.
 */
export function matchIssuesToLog(list: IssuesToLog, term: string): MatchedIssues {
  const words = normalize(term).split(/\s+/).filter(Boolean);
  const parentIds = new Set(list.parentIds);
  const matches: { issue: JiraIssue; rank: number; index: number }[] = [];

  list.issues.forEach((issue, index) => {
    if (issue.status.categoryKey === 'done') return;
    const key = issue.key.toLowerCase();
    const number = key.slice(key.lastIndexOf('-') + 1);
    const text = `${key} ${normalize(issue.summary)}`;
    if (!words.every((word) => text.includes(word))) return;
    const rank = words.some((word) => word === key || word === number) ? 0 : words.some((word) => key.includes(word)) ? 1 : 2;
    matches.push({ issue, rank, index });
  });

  matches.sort((a, b) => a.rank - b.rank || a.index - b.index);
  const loggable = matches.filter(({ issue }) => !parentIds.has(issue.id));
  return {
    issues: loggable.map(({ issue }) => issue),
    hiddenParents: matches.length - loggable.length,
  };
}
