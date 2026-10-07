import { CircleNotch, MagnifyingGlass } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState } from 'react';
import type { JiraIssue } from '@/api/jira-issues';
import { Notice } from '@/components/Notice';
import { useIssuesToLogQuery } from '@/features/team-reports/api/useIssuesToLogQuery';
import styles from './StopwatchIssuePicker.module.css';

const MAX_SHOWN = 8;

interface StopwatchIssuePickerProps {
  issueKey: string;
  issueSummary: string;
  disabled: boolean;
  onChoose: (issue: JiraIssue) => void;
}

export function StopwatchIssuePicker({ issueKey, issueSummary, disabled, onChoose }: StopwatchIssuePickerProps) {
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(issueKey === '');
  const [term, setTerm] = useState('');
  const search = useIssuesToLogQuery(term, picking && !disabled);
  const issues = (search.data?.issues ?? []).slice(0, MAX_SHOWN);

  useEffect(() => {
    if (picking) searchRef.current?.focus();
  }, [picking]);

  function closePicker() {
    setPicking(false);
    setTerm('');
  }

  function choose(issue: JiraIssue) {
    onChoose(issue);
    closePicker();
  }

  let results;
  if (search.isPending) {
    results = (
      <p className={styles.hint}>
        <CircleNotch size={14} weight="bold" className={styles.spinner} aria-hidden /> Buscando tarefas…
      </p>
    );
  } else if (search.isError) {
    results = <Notice tone="error">{search.error.message}</Notice>;
  } else if (issues.length === 0) {
    results = (
      <p className={styles.hint}>{term.trim() ? 'Nenhuma tarefa aberta com esse termo.' : 'Nenhuma tarefa aberta atribuída a você.'}</p>
    );
  } else {
    results = (
      <ul className={styles.list}>
        {issues.map((issue) => {
          const current = issue.key === issueKey;
          return (
            <li key={issue.id}>
              <button type="button" className={styles.option} aria-current={current ? 'true' : undefined} onClick={() => choose(issue)}>
                <span className={styles.optionKey}>{issue.key}</span>
                <span className={styles.optionSummary}>{issue.summary}</span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  if (!issueKey) {
    return (
      <section className={styles.card} aria-label="Tarefa">
        <label className={styles.label} htmlFor={searchId}>
          Tarefa
        </label>
        <div className={styles.search}>
          <MagnifyingGlass size={16} weight="bold" className={styles.searchIcon} aria-hidden />
          <input
            ref={searchRef}
            id={searchId}
            className={`input ${styles.searchInput}`}
            type="search"
            placeholder="Número, chave ou resumo"
            autoComplete="off"
            value={term}
            disabled={disabled}
            onChange={(event) => setTerm(event.target.value)}
          />
        </div>
        {results}
      </section>
    );
  }

  return (
    <section className={styles.card} aria-label="Tarefa escolhida" data-open={picking ? '' : undefined}>
      <div className={styles.cardTop}>
        <div className={styles.identity}>
          <p className={styles.key}>{issueKey}</p>
          <p className={styles.summary}>{issueSummary}</p>
        </div>
        <button type="button" className={styles.swap} onClick={() => (picking ? closePicker() : setPicking(true))} disabled={disabled}>
          {picking ? 'Cancelar' : 'Trocar'}
        </button>
      </div>
      {picking && (
        <div className={styles.panel}>
          <label className={styles.sr} htmlFor={searchId}>
            Pesquisar tarefa
          </label>
          <div className={styles.search}>
            <MagnifyingGlass size={16} weight="bold" className={styles.searchIcon} aria-hidden />
            <input
              ref={searchRef}
              id={searchId}
              className={`input ${styles.searchInput}`}
              type="search"
              placeholder="Número, chave ou resumo"
              autoComplete="off"
              value={term}
              disabled={disabled}
              onChange={(event) => setTerm(event.target.value)}
            />
          </div>
          {results}
        </div>
      )}
    </section>
  );
}
