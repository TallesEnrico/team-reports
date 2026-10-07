import type { JiraIssue } from '../api/jira-issues';
import { isPlainClick } from '../lib/isPlainClick';
import styles from './IssueKeyLink.module.css';

interface IssueKeyLinkProps {
  issue: JiraIssue;
  /** Endereço do modal da issue (Ctrl/⌘ + clique abre em outra aba, com o modal aberto). */
  href: string;
  onOpen: (issue: JiraIssue) => void;
}

/** Chave da issue que abre o modal dela, como nas outras telas. */
export function IssueKeyLink({ issue, href, onOpen }: IssueKeyLinkProps) {
  return (
    <a
      className={styles.link}
      href={href}
      aria-haspopup="dialog"
      title={issue.summary}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        onOpen(issue);
      }}
    >
      {issue.issueType.iconUrl && <img src={issue.issueType.iconUrl} alt="" width={14} height={14} />}
      <span className={issue.status.categoryKey === 'done' ? styles.done : undefined}>{issue.key}</span>
    </a>
  );
}
