import { CaretRight, Plus } from '@phosphor-icons/react';
import { memo, type PointerEvent } from 'react';
import { cx } from '../../../lib/cx';
import { isDateKey } from '../../../lib/dates';
import { formatDuration, type TimeFormat } from '../../../lib/formatDuration';
import { isPlainClick } from '../../../lib/isPlainClick';
import type { PeriodColumn, ReportRow } from '../lib/buildReportTable';
import { formatFieldValue } from '../lib/formatFieldValue';
import type { JiraField } from '../types';
import styles from './ReportTable.module.css';

interface ReportTableRowProps {
  row: ReportRow;
  columns: PeriodColumn[];
  fields: JiraField[];
  timeFormat: TimeFormat;
  isChild?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
  /** Hover numa célula de período com apontamentos (abre o tooltip). */
  onCellPointerEnter: (event: PointerEvent<HTMLTableCellElement>, row: ReportRow, column: PeriodColumn) => void;
  onCellPointerLeave: () => void;
  /** Clique no horário de uma célula com apontamentos (abre os detalhes). */
  onCellClick: (row: ReportRow, column: PeriodColumn) => void;
  /** Linha de issue e coluna de dia: o clique abre o lançamento já na tarefa e na data. */
  canLogWork: boolean;
  onLogWork: (row: ReportRow, column: PeriodColumn) => void;
  /** Endereço do modal da issue (Ctrl/⌘ + clique abre em outra aba). */
  issueHref: (issueKey: string) => string;
  /** Clique na chave: abre o modal da issue (ou da issue pai, na linha do grupo). */
  onOpenIssue: (row: ReportRow) => void;
}

// memo: abrir e trocar o tooltip re-renderiza a tabela, e as linhas não mudam com ele.
export const ReportTableRow = memo(function ReportTableRow({
  row,
  columns,
  fields,
  timeFormat,
  isChild,
  isExpanded,
  onToggle,
  onCellPointerEnter,
  onCellPointerLeave,
  onCellClick,
  canLogWork,
  onLogWork,
  issueHref,
  onOpenIssue,
}: ReportTableRowProps) {
  const format = (seconds: number) => formatDuration(seconds, timeFormat);
  const isGroup = row.kind === 'group';
  const issueType = row.issue?.issueType?.name;
  const issueKey = row.issue?.key ?? row.parentIssue?.key;

  return (
    <tr className={cx(isGroup && styles.groupRow, isChild && styles.childRow)}>
      <th
        scope="row"
        className={cx(styles.rowHeader, styles.stickyLeft, row.inProgress && styles.inProgress)}
        title={row.inProgress ? `Em andamento (${row.issue?.status?.name})` : undefined}
      >
        <div className={styles.rowHeaderInner}>
          {onToggle && (
            <button
              type="button"
              className={styles.toggle}
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Recolher' : 'Expandir'} ${row.label}`}
              onClick={onToggle}
            >
              <CaretRight size={12} weight="bold" aria-hidden />
            </button>
          )}
          {row.avatarUrl && (
            <img className={styles.avatar} src={row.avatarUrl} alt="" width={20} height={20} referrerPolicy="no-referrer" />
          )}
          {row.iconUrl && (
            <img className={styles.typeIcon} src={row.iconUrl} alt={issueType ?? ''} title={issueType} width={16} height={16} />
          )}
          {issueKey ? (
            <a
              className={styles.key}
              href={issueHref(issueKey)}
              aria-haspopup="dialog"
              onClick={(event) => {
                if (!isPlainClick(event)) return;
                event.preventDefault();
                onOpenIssue(row);
              }}
            >
              {row.label}
            </a>
          ) : (
            <span className={styles.groupLabel}>{row.label}</span>
          )}
          {row.secondary && (
            <span className={styles.secondary} title={row.secondary}>
              {row.secondary}
            </span>
          )}
          {row.inProgress && <span className="sr-only">(em andamento)</span>}
          {row.children && (
            <span className={styles.count} title={`${row.children.length} issues`}>
              {row.children.length}
            </span>
          )}
        </div>
      </th>

      <td className={cx(styles.num, styles.total, styles.stickyTotal)}>{format(row.total)}</td>

      {fields.map((field) => {
        const text = row.issue ? formatFieldValue(row.issue.fields[field.id], field) : '';
        return (
          <td key={field.id} className={styles.fieldCell} title={text || undefined}>
            {text}
          </td>
        );
      })}

      {columns.map((column) => {
        const hasWorklogs = Boolean(row.worklogs?.[column.key]?.length);
        const text = format(row.cells[column.key] ?? 0);
        const isLogTarget = canLogWork && row.kind === 'issue' && Boolean(row.issue) && isDateKey(column.key);
        return (
          <td
            key={column.key}
            className={cx(
              styles.num,
              styles.periodCell,
              column.isWeekend && styles.weekend,
              column.isToday && styles.todayCell,
              (isLogTarget || hasWorklogs) && styles.clickableCell,
            )}
            onPointerEnter={hasWorklogs ? (event) => onCellPointerEnter(event, row, column) : undefined}
            onPointerLeave={hasWorklogs ? onCellPointerLeave : undefined}
          >
            {hasWorklogs ? (
              <button type="button" className={styles.cellButton} aria-haspopup="dialog" onClick={() => onCellClick(row, column)}>
                {text}
              </button>
            ) : isLogTarget ? (
              <button
                type="button"
                className={styles.cellButton}
                aria-haspopup="dialog"
                aria-label={`Lançar horas em ${row.label}, ${column.title}`}
                onClick={() => onLogWork(row, column)}
              >
                <Plus size={14} weight="bold" className={styles.cellPlus} aria-hidden />
              </button>
            ) : (
              text
            )}
          </td>
        );
      })}
    </tr>
  );
});
