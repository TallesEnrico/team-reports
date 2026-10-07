import { CaretDown, CaretRight, CaretUp } from '@phosphor-icons/react';
import { type MouseEvent, memo, type ReactNode, useMemo, useState } from 'react';
import { overEstimateSeconds } from '../../../api/jira-issues';
import { Avatar } from '../../../components/Avatar';
import { RefreshOverlay } from '../../../components/RefreshOverlay';
import { StatusPicker } from '../../../components/StatusPicker';
import { useColumnResize } from '../../../hooks/useColumnResize';
import { cx } from '../../../lib/cx';
import { formatDuration } from '../../../lib/formatDuration';
import { isPlainClick } from '../../../lib/isPlainClick';
import { parentToIssue } from '../../../lib/parentIssue';
import type { ColumnMetrics } from '../lib/boardView';
import { COLUMN_MENU_WIDTH, MAX_COLUMN_WIDTH, type SheetColumnDef, visibleSheetColumns } from '../lib/sheetColumns';
import type { SheetGroup, SheetView } from '../lib/sheetView';
import { RANK_SORT } from '../store/useKanbanStore';
import type { JiraIssue, SheetColumnKey, SheetSort } from '../types';
import styles from './IssueSheet.module.css';
import { SheetColumnMenu } from './SheetColumnMenu';

interface IssueSheetProps {
  view: SheetView;
  /** Colunas escolhidas (a chave aparece sempre). */
  columns: SheetColumnKey[];
  onColumnsChange: (columns: SheetColumnKey[]) => void;
  /** Larguras ajustadas pela pessoa; sem valor, a padrão. */
  widths: Partial<Record<SheetColumnKey, number>>;
  /** `null` volta à largura padrão. */
  onWidthChange: (column: SheetColumnKey, width: number | null) => void;
  sort: SheetSort;
  onSortChange: (sort: SheetSort) => void;
  isFiltered: boolean;
  /** O status de cada linha troca ali mesmo (como arrastar o card no quadro). */
  canChangeStatus: boolean;
  isRefreshing: boolean;
  /** Depois da última linha, antes do total (ex: o "Carregar mais" das concluídas). */
  footer?: ReactNode;
  /** Link de cada issue (Ctrl/⌘ + clique abre em outra aba, com o modal). */
  issueHref: (issueKey: string) => string;
  onOpenIssue: (issue: JiraIssue) => void;
}

function hours(seconds: number): string {
  return formatDuration(seconds, 'hours-minutes') || '0h 00m';
}

/** Próximo estado da ordenação ao clicar numa coluna: o sentido inicial, o contrário e, de novo, a ordem do quadro. */
function nextSort(current: SheetSort, column: SheetColumnDef): SheetSort {
  if (current.key !== column.key) return { key: column.key, direction: column.initial };
  if (current.direction === column.initial) return { key: column.key, direction: column.initial === 'asc' ? 'desc' : 'asc' };
  return RANK_SORT;
}

/** Link para o modal da issue: o clique simples abre na hora; com Ctrl/⌘, o navegador abre outra aba. */
function openOnPlainClick(event: MouseEvent, open: () => void) {
  if (!isPlainClick(event)) return;
  event.preventDefault();
  open();
}

/**
 * O quadro em planilha: uma linha por issue, agrupadas (por coluna do quadro,
 * issue pai ou nenhum), com os tempos somados por grupo e no total. As colunas
 * aparecem conforme a escolha (botão no canto do cabeçalho), ordenam ao clicar
 * no título e mudam de largura arrastando a divisa entre elas, em qualquer
 * altura da tabela; a chave e o resumo abrem o modal da issue.
 *
 * Cada coluna tem a própria largura (`table-layout: fixed`). A coluna do botão
 * de colunas fica com o que sobra da moldura: o botão fica sempre na borda
 * direita. Com a soma das colunas mais larga que a moldura, a tabela rola dentro
 * dela (a página não rola para o lado), com o botão preso à direita.
 */
export function IssueSheet({
  view,
  columns: chosen,
  onColumnsChange,
  widths,
  onWidthChange,
  sort,
  onSortChange,
  isFiltered,
  canChangeStatus,
  isRefreshing,
  footer,
  issueHref,
  onOpenIssue,
}: IssueSheetProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  /** Largura da coluna durante o arrasto (só a planilha redesenha; as linhas não mudam). */
  const [draft, setDraft] = useState<{ key: SheetColumnKey; width: number } | null>(null);

  // Mesma lista enquanto a escolha não muda: as linhas (memo) não redesenham ao arrastar uma divisa.
  const columns = useMemo(() => visibleSheetColumns(chosen), [chosen]);
  const savedWidth = (column: SheetColumnDef) => widths[column.key] ?? column.width;
  const widthOf = (column: SheetColumnDef) => (draft?.key === column.key ? draft.width : savedWidth(column));
  const tableWidth = columns.reduce((sum, column) => sum + widthOf(column), 0) + COLUMN_MENU_WIDTH;
  const textColumns = columns.filter((column) => !column.numeric).length;
  const numericColumns = columns.filter((column) => column.numeric);
  // Divisas: a borda direita de cada coluna, em px a partir da esquerda da tabela.
  let edge = 0;
  const edges = columns.map((column) => (edge += widthOf(column)));

  function toggle(groupKey: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  return (
    <div className={cx(styles.frame, isRefreshing && styles.refreshing)} aria-busy={isRefreshing}>
      <div className={styles.scroll}>
        <div className={styles.canvas} style={{ minWidth: tableWidth }}>
          {/* Antes da tabela: no Tab, as divisas vêm junto com o cabeçalho, antes das linhas. */}
          {columns.map((column, index) => (
            <ColumnResizer
              key={column.key}
              column={column}
              left={edges[index]}
              width={savedWidth(column)}
              isActive={draft?.key === column.key}
              onPreview={(width) => setDraft({ key: column.key, width })}
              onCommit={(width) => {
                setDraft(null);
                onWidthChange(column.key, width);
              }}
              onCancel={() => setDraft(null)}
              onReset={() => {
                setDraft(null);
                onWidthChange(column.key, null);
              }}
            />
          ))}

          <table className={styles.table}>
            <colgroup>
              {columns.map((column) => (
                <col key={column.key} style={{ width: widthOf(column) }} />
              ))}
              {/* Sem largura: fica com o que sobra (no mínimo COLUMN_MENU_WIDTH, que entra no mínimo da tabela). */}
              <col />
            </colgroup>
            <thead>
              <tr>
                {columns.map((column) => (
                  <HeaderCell key={column.key} column={column} sort={sort} onSortChange={onSortChange} />
                ))}
                <th scope="col" className={styles.menuCell}>
                  <SheetColumnMenu value={chosen} onChange={onColumnsChange} />
                </th>
              </tr>
            </thead>

            {view.groups.map((group) => {
              const isCollapsed = collapsed.has(group.key);
              return (
                <tbody key={group.key}>
                  {group.header && (
                    <GroupHeader
                      group={group}
                      textColumns={textColumns}
                      numericColumns={numericColumns}
                      isCollapsed={isCollapsed}
                      isFiltered={isFiltered}
                      onToggle={() => toggle(group.key)}
                      issueHref={issueHref}
                      onOpenIssue={onOpenIssue}
                    />
                  )}
                  {!isCollapsed &&
                    group.issues.map((issue) => (
                      <SheetRow
                        key={issue.id}
                        issue={issue}
                        columns={columns}
                        canChangeStatus={canChangeStatus}
                        issueHref={issueHref}
                        onOpenIssue={onOpenIssue}
                      />
                    ))}
                  {!isCollapsed && group.issues.length === 0 && (
                    <tr>
                      <td colSpan={columns.length + 1} className={styles.emptyRow}>
                        {isFiltered ? 'Nenhuma issue com os filtros.' : 'Nenhuma issue.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}

            {footer && (
              <tbody>
                <tr>
                  <td colSpan={columns.length + 1} className={styles.footerCell}>
                    <div className={styles.footerContent}>{footer}</div>
                  </td>
                </tr>
              </tbody>
            )}

            <tfoot>
              <tr>
                <th scope="row" colSpan={textColumns}>
                  Total · {view.shown} {view.shown === 1 ? 'issue' : 'issues'}
                  {isFiltered && <span className={styles.muted}> de {view.total}</span>}
                </th>
                <TimeTotals metrics={view.metrics} columns={numericColumns} />
                <td className={styles.menuCell} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      {isRefreshing && <RefreshOverlay />}
    </div>
  );
}

interface ColumnResizerProps {
  column: SheetColumnDef;
  /** Borda direita da coluna, em px a partir da esquerda da tabela. */
  left: number;
  /** Largura salva (a da coluna fora do arrasto). */
  width: number;
  isActive: boolean;
  onPreview: (width: number) => void;
  onCommit: (width: number) => void;
  onCancel: () => void;
  onReset: () => void;
}

/**
 * Divisa à direita de uma coluna, da altura da tabela inteira: arrastar muda a
 * largura da coluna; setas também (Shift: passos maiores); Esc cancela; duplo
 * clique volta à padrão.
 */
function ColumnResizer({ column, left, width, isActive, onPreview, onCommit, onCancel, onReset }: ColumnResizerProps) {
  const { handleProps } = useColumnResize({
    getWidth: () => width,
    getBounds: () => ({ min: column.minWidth, max: MAX_COLUMN_WIDTH }),
    onPreview,
    onCommit,
    onCancel,
    onReset,
  });

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Largura da coluna ${column.label}`}
      aria-valuemin={column.minWidth}
      aria-valuemax={MAX_COLUMN_WIDTH}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      title={`${column.label}: arraste para ajustar a largura. Duplo clique restaura.`}
      className={styles.resizer}
      style={{ left }}
      data-active={isActive || undefined}
      {...handleProps}
    />
  );
}

interface HeaderCellProps {
  column: SheetColumnDef;
  sort: SheetSort;
  onSortChange: (sort: SheetSort) => void;
}

/** Título da coluna: ordena ao clicar (a largura muda pela divisa, `ColumnResizer`). */
function HeaderCell({ column, sort, onSortChange }: HeaderCellProps) {
  return (
    <th
      scope="col"
      className={cx(column.numeric && styles.numeric)}
      aria-sort={sort.key === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <button type="button" className={styles.sort} onClick={() => onSortChange(nextSort(sort, column))}>
        <span className={styles.truncate}>{column.label}</span>
        {sort.key === column.key &&
          (sort.direction === 'asc' ? <CaretUp size={11} weight="bold" aria-hidden /> : <CaretDown size={11} weight="bold" aria-hidden />)}
      </button>
    </th>
  );
}

function TimeTotals({ metrics, columns }: { metrics: ColumnMetrics; columns: SheetColumnDef[] }) {
  const value: Partial<Record<SheetColumnKey, number>> = {
    estimate: metrics.estimatedSeconds,
    spent: metrics.spentSeconds,
    remaining: metrics.remainingSeconds,
  };
  return columns.map((column) => (
    <td key={column.key} className={styles.numeric}>
      {hours(value[column.key] ?? 0)}
    </td>
  ));
}

interface GroupHeaderProps {
  group: SheetGroup;
  textColumns: number;
  numericColumns: SheetColumnDef[];
  isCollapsed: boolean;
  isFiltered: boolean;
  onToggle: () => void;
  issueHref: (issueKey: string) => string;
  onOpenIssue: (issue: JiraIssue) => void;
}

/** Cabeçalho do grupo: recolhe o grupo, mostra o nome, a contagem, o limite de WIP (coluna) e os tempos somados. */
function GroupHeader({ group, textColumns, numericColumns, isCollapsed, isFiltered, onToggle, issueHref, onOpenIssue }: GroupHeaderProps) {
  const header = group.header!;
  const count = group.issues.length;
  const name = header.kind === 'column' ? header.column.name : header.kind === 'parent' ? header.parent.key : 'Sem issue pai';

  return (
    <tr className={styles.groupRow}>
      <th scope="rowgroup" colSpan={textColumns}>
        <span className={styles.groupTitle}>
          <button
            type="button"
            className={styles.collapse}
            aria-expanded={!isCollapsed}
            aria-label={`${isCollapsed ? 'Mostrar' : 'Esconder'} ${name}`}
            onClick={onToggle}
          >
            {isCollapsed ? <CaretRight size={12} weight="bold" aria-hidden /> : <CaretDown size={12} weight="bold" aria-hidden />}
          </button>

          {header.kind === 'column' && (
            <>
              <span className={styles.groupName}>{header.column.name}</span>
              <span className={styles.groupCount}>{isFiltered ? `${count} de ${header.total}` : header.total}</span>
              {header.column.max !== undefined && (
                <span className={styles.wip} data-exceeded={header.total > header.column.max || undefined}>
                  Máx. {header.column.max}
                </span>
              )}
            </>
          )}

          {header.kind === 'parent' && (
            <>
              <a
                href={issueHref(header.parent.key)}
                className={styles.groupParent}
                onClick={(event) => openOnPlainClick(event, () => onOpenIssue(parentToIssue(header.parent)))}
              >
                {header.parent.iconUrl && <img src={header.parent.iconUrl} alt="" width={14} height={14} />}
                <span className={styles.groupKey}>{header.parent.key}</span>
              </a>
              <span className={styles.groupSummary} title={header.parent.summary}>
                {header.parent.summary}
              </span>
              <span className={styles.groupCount}>{count}</span>
            </>
          )}

          {header.kind === 'loose' && (
            <>
              <span className={styles.groupName}>Sem issue pai</span>
              <span className={styles.groupCount}>{count}</span>
            </>
          )}
        </span>
      </th>
      <TimeTotals metrics={group.metrics} columns={numericColumns} />
      <td className={styles.menuCell} />
    </tr>
  );
}

interface SheetRowProps {
  issue: JiraIssue;
  columns: SheetColumnDef[];
  canChangeStatus: boolean;
  issueHref: (issueKey: string) => string;
  onOpenIssue: (issue: JiraIssue) => void;
}

// Memo: ordenar, filtrar ou abrir o modal não redesenha as linhas que não mudaram.
const SheetRow = memo(function SheetRow({ issue, columns, canChangeStatus, issueHref, onOpenIssue }: SheetRowProps) {
  const [statusError, setStatusError] = useState<string | null>(null);
  const isDone = issue.status.categoryKey === 'done';
  const over = overEstimateSeconds(issue);
  const href = issueHref(issue.key);
  const open = (event: MouseEvent) => openOnPlainClick(event, () => onOpenIssue(issue));

  function cell(key: SheetColumnKey): ReactNode {
    switch (key) {
      case 'key':
        return (
          <a href={href} className={styles.keyLink} onClick={open}>
            {issue.issueType.iconUrl && (
              <img src={issue.issueType.iconUrl} alt={issue.issueType.name} title={issue.issueType.name} width={16} height={16} />
            )}
            <span className={cx(styles.keyText, isDone && styles.done)}>{issue.key}</span>
          </a>
        );
      case 'summary':
        // A chave já é o link pelo teclado: este fica fora do Tab.
        return (
          <a href={href} className={styles.summaryLink} title={issue.summary} tabIndex={-1} onClick={open}>
            {issue.summary}
          </a>
        );
      case 'status':
        return <StatusPicker issue={issue} canChange={canChangeStatus} onErrorChange={setStatusError} />;
      case 'assignee':
        return issue.assignee ? (
          <span className={styles.person} title={issue.assignee.displayName}>
            <Avatar src={issue.assignee.avatarUrl} name={issue.assignee.displayName} size={20} />
            <span className={styles.truncate}>{issue.assignee.displayName}</span>
          </span>
        ) : (
          <span className={styles.muted}>Sem responsável</span>
        );
      case 'priority':
        return issue.priority ? (
          <span className={styles.person} title={issue.priority.name}>
            {issue.priority.iconUrl && <img src={issue.priority.iconUrl} alt="" width={16} height={16} />}
            <span className={styles.truncate}>{issue.priority.name}</span>
          </span>
        ) : (
          <span className={styles.muted}>—</span>
        );
      case 'parent':
        return issue.parent ? (
          <a
            href={issueHref(issue.parent.key)}
            className={styles.parentLink}
            title={`${issue.parent.key} ${issue.parent.summary}`}
            onClick={(event) => openOnPlainClick(event, () => onOpenIssue(parentToIssue(issue.parent!)))}
          >
            <span className={styles.parentKey}>{issue.parent.key}</span>
            <span className={styles.truncate}>{issue.parent.summary}</span>
          </a>
        ) : (
          <span className={styles.muted}>—</span>
        );
      case 'estimate':
        return issue.originalEstimateSeconds ? hours(issue.originalEstimateSeconds) : <span className={styles.muted}>—</span>;
      case 'spent':
        return (
          <>
            {hours(issue.timeSpentSeconds)}
            {over > 0 && (
              <span className={styles.overBadge}>
                +{hours(over)}
                <span className="sr-only"> acima da estimativa</span>
              </span>
            )}
          </>
        );
      case 'remaining':
        return issue.remainingEstimateSeconds !== undefined ? (
          hours(issue.remainingEstimateSeconds)
        ) : (
          <span className={styles.muted}>—</span>
        );
    }
  }

  return (
    <>
      <tr className={styles.row} data-over-estimate={over > 0 || undefined}>
        {columns.map((column) => (
          <td
            key={column.key}
            className={cx(
              column.numeric && styles.numeric,
              // O status não corta: o menu dele sai da célula.
              column.key !== 'status' && styles.clip,
              column.key === 'spent' && over > 0 && styles.overTime,
            )}
            title={column.key === 'spent' && over > 0 ? `Acima da estimativa em ${hours(over)}` : undefined}
          >
            {cell(column.key)}
          </td>
        ))}
        <td className={styles.menuCell} />
      </tr>
      {statusError && (
        <tr className={styles.errorRow}>
          <td colSpan={columns.length + 1} role="alert">
            {issue.key}: {statusError}
          </td>
        </tr>
      )}
    </>
  );
});
