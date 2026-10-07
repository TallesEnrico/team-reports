import { type CSSProperties, Fragment, type PointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { JiraIssue } from '../../../api/jira-issues';
import { useJiraWriteAccess } from '../../../api/useJiraWriteAccessQuery';
import { RefreshOverlay } from '../../../components/RefreshOverlay';
import { useColumnResize } from '../../../hooks/useColumnResize';
import { cx } from '../../../lib/cx';
import { isDateKey } from '../../../lib/dates';
import { formatDuration, type TimeFormat } from '../../../lib/formatDuration';
import { useHoverTooltip } from '../../../hooks/useHoverTooltip';
import {
  type CellWorklog,
  findRow,
  type PeriodColumn,
  type ReportTable as ReportTableModel,
  type ReportRow,
} from '../lib/buildReportTable';
import type { ReportTimeZone } from '../../../lib/timeZones';
import { rowIssue } from '../lib/rowIssue';
import type { GroupBy, JiraField, PeriodGrouping } from '../types';
import styles from './ReportTable.module.css';
import { useLogWorkDialogStore } from '../store/useLogWorkDialogStore';
import { ReportTableRow } from './ReportTableRow';
import { WorklogDialog } from './WorklogDialog';
import { WorklogTooltip } from './WorklogTooltip';

// Mantenha DEFAULT em sincronia com `--row-header-width` em ReportTable.module.css.
const DEFAULT_ROW_HEADER_WIDTH = 400;
const MIN_ROW_HEADER_WIDTH = 180;
const MAX_ROW_HEADER_WIDTH = 900;
/** Espaço que continua visível para as colunas de data quando a descrição é alargada. */
const MIN_VISIBLE_PERIODS_WIDTH = 120;

const ROW_HEADER_LABEL: Record<GroupBy, string> = {
  issue: 'Issue',
  parent: 'Issue pai',
  user: 'Pessoa',
  project: 'Projeto',
};

interface CellTooltipData {
  title: string;
  seconds: number;
  worklogs: CellWorklog[];
}

interface ReportTableProps {
  table: ReportTableModel;
  fields: JiraField[];
  groupBy: GroupBy;
  /** Colunas de dia aceitam clique para lançar horas na tarefa da linha. */
  period: PeriodGrouping;
  timeFormat: TimeFormat;
  /** Fuso das colunas de data: os horários do modal de apontamentos usam o mesmo. */
  timeZone: ReportTimeZone;
  /** Busca em andamento com a tabela já na tela (botão atualizar ou filtros novos). */
  isRefreshing: boolean;
  /** Largura escolhida para a coluna de descrição; `null` usa o padrão do CSS. */
  rowHeaderWidth: number | null;
  onRowHeaderWidthChange: (width: number | null) => void;
  /** Endereço do modal de uma issue (link da chave). */
  issueHref: (issueKey: string) => string;
  /** Clique na chave de uma linha (ou no modal de apontamentos): abre o modal da issue. */
  onOpenIssue: (issue: JiraIssue) => void;
}

export function ReportTable({
  table,
  fields,
  groupBy,
  period,
  timeFormat,
  timeZone,
  isRefreshing,
  rowHeaderWidth,
  onRowHeaderWidthChange,
  issueHref,
  onOpenIssue,
}: ReportTableProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  /** Célula com o modal de apontamentos aberto. */
  const [openCell, setOpenCell] = useState<{ row: ReportRow; column: PeriodColumn } | null>(null);
  const openLogWork = useLogWorkDialogStore((state) => state.open);
  const { canWrite } = useJiraWriteAccess();
  const canLogWork = period === 'day' && canWrite;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const format = (seconds: number) => formatDuration(seconds, timeFormat);
  const { target: tooltip, show: showTooltip, hide: hideTooltip } = useHoverTooltip<CellTooltipData>();

  // Dados novos (refetch, outro agrupamento ou período) desatualizam o conteúdo aberto.
  useEffect(() => hideTooltip(), [table, hideTooltip]);

  const handleCellPointerEnter = useCallback(
    (event: PointerEvent<HTMLTableCellElement>, row: ReportRow, column: PeriodColumn) => {
      const worklogs = row.worklogs?.[column.key];
      // No toque não há hover: o tooltip abriria com o dedo e ficaria preso na tela.
      if (!worklogs?.length || event.pointerType === 'touch') return;
      showTooltip(event.currentTarget, { title: column.title, seconds: row.cells[column.key] ?? 0, worklogs });
    },
    [showTooltip],
  );

  const handleCellClick = useCallback(
    (row: ReportRow, column: PeriodColumn) => {
      hideTooltip();
      setOpenCell({ row, column });
    },
    [hideTooltip],
  );

  const handleLogWork = useCallback(
    (row: ReportRow, column: PeriodColumn) => {
      if (!row.issue || !isDateKey(column.key)) return;
      hideTooltip();
      setOpenCell(null);
      openLogWork({ issue: row.issue, date: column.key });
    },
    [hideTooltip, openLogWork],
  );

  const handleOpenRow = useCallback(
    (row: ReportRow) => {
      const issue = rowIssue(row);
      if (!issue) return;
      hideTooltip();
      onOpenIssue(issue);
    },
    [hideTooltip, onOpenIssue],
  );

  function readCssPx(property: string): number {
    const scroller = scrollerRef.current;
    return scroller ? parseFloat(getComputedStyle(scroller).getPropertyValue(property)) || 0 : 0;
  }

  // Durante o arrasto a largura vai direto na variável CSS: re-renderizar
  // milhares de células a cada movimento do mouse travaria a interação.
  function previewRowHeaderWidth(width: number | null) {
    const style = scrollerRef.current?.style;
    if (!style) return;
    if (width === null) style.removeProperty('--row-header-width');
    else style.setProperty('--row-header-width', `${width}px`);
  }

  const { handleProps: resizeHandleProps } = useColumnResize({
    getWidth: () => readCssPx('--row-header-width'),
    getBounds: () => {
      const available = (scrollerRef.current?.clientWidth ?? 0) - readCssPx('--total-width') - MIN_VISIBLE_PERIODS_WIDTH;
      return { min: MIN_ROW_HEADER_WIDTH, max: Math.max(MIN_ROW_HEADER_WIDTH, Math.min(MAX_ROW_HEADER_WIDTH, available)) };
    },
    onPreview: previewRowHeaderWidth,
    onCommit: onRowHeaderWidthChange,
    onCancel: () => previewRowHeaderWidth(rowHeaderWidth),
    onReset: () => {
      previewRowHeaderWidth(null);
      onRowHeaderWidthChange(null);
    },
    onDragStart: (handle) => {
      scrollerRef.current?.setAttribute('data-resizing', '');
      handle.setAttribute('data-active', '');
    },
    onDragEnd: (handle) => {
      scrollerRef.current?.removeAttribute('data-resizing');
      handle.removeAttribute('data-active');
    },
  });

  // A descrição tem a divisa da altura da tabela (dá para arrastar a borda em
  // qualquer linha), a única no Tab, com as setas do teclado. As demais colunas
  // têm uma alça na borda direita do cabeçalho que também ajusta a descrição: a
  // borda arrastada acompanha o mouse porque tudo à direita da descrição desliza
  // junto. São atalhos de mouse, para não criar dezenas de paradas de foco no cabeçalho.
  const { onKeyDown: resizeWithKeyboard, ...resizeWithPointer } = resizeHandleProps;
  const resizeHint = 'Arraste para ajustar a largura da descrição. Duplo clique restaura.';

  function renderResizeHandle() {
    return <div aria-hidden title={resizeHint} className={styles.resizeHandle} {...resizeWithPointer} />;
  }

  const scrollerStyle =
    rowHeaderWidth === null ? undefined : ({ '--row-header-width': `${rowHeaderWidth}px` } as CSSProperties);

  const isGrouped = groupBy !== 'issue';
  const allCollapsed = isGrouped && table.rows.length > 0 && table.rows.every((row) => collapsed.has(row.id));

  function toggleRow(id: string) {
    // Recolher pode remover a célula sob o tooltip sem disparar o pointerleave.
    hideTooltip();
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    hideTooltip();
    setCollapsed(allCollapsed ? new Set() : new Set(table.rows.map((row) => row.id)));
  }

  return (
    // A moldura posiciona o aviso de carregamento sobre a área visível da tabela,
    // e não no meio de uma tabela que pode ter centenas de linhas.
    <div className={cx(styles.frame, isRefreshing && styles.refreshing)}>
      <div ref={scrollerRef} className={styles.scroller} style={scrollerStyle} aria-busy={isRefreshing}>
        {/* Tabela e divisa da descrição juntas: a divisa tem a altura da tabela. */}
        <div className={styles.canvas}>
          {/* Presa à esquerda, como a descrição: a divisa acompanha a borda dela ao rolar para o lado. */}
          <div className={styles.resizeRail}>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Largura da coluna de descrição"
              aria-valuemin={MIN_ROW_HEADER_WIDTH}
              aria-valuemax={MAX_ROW_HEADER_WIDTH}
              aria-valuenow={rowHeaderWidth ?? DEFAULT_ROW_HEADER_WIDTH}
              tabIndex={0}
              title={resizeHint}
              className={styles.rowHeaderResizer}
              {...resizeWithPointer}
              onKeyDown={resizeWithKeyboard}
            />
          </div>
          <table className={styles.table}>
            <thead>
              <tr className={styles.bandRow}>
                <th rowSpan={2} scope="col" className={cx(styles.rowHeader, styles.stickyLeft)}>
                  <div className={styles.rowHeaderInner}>
                    <span>{ROW_HEADER_LABEL[groupBy]}</span>
                    {isGrouped && (
                      <button type="button" className={styles.linkButton} onClick={toggleAll}>
                        {allCollapsed ? 'Expandir tudo' : 'Recolher tudo'}
                      </button>
                    )}
                  </div>
                </th>
                <th rowSpan={2} scope="col" className={cx(styles.num, styles.stickyTotal)}>
                  Total
                  {renderResizeHandle()}
                </th>
                {fields.map((field) => (
                  <th key={field.id} rowSpan={2} scope="col" className={styles.fieldCell}>
                    {field.name}
                    {renderResizeHandle()}
                  </th>
                ))}
                {table.bands.map((band) => (
                  <th key={band.key} colSpan={band.span} scope="colgroup" className={styles.band}>
                    <span>{band.label}</span>
                  </th>
                ))}
              </tr>
              <tr className={styles.periodRow}>
                {table.columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    title={column.title}
                    className={cx(styles.period, styles.periodCell, column.isWeekend && styles.weekend, column.isToday && styles.today)}
                  >
                    <span className={styles.periodLabel}>{column.label}</span>
                    <span className={styles.periodSub}>{column.sublabel}</span>
                    {renderResizeHandle()}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {table.rows.map((row) => {
                const isExpanded = !collapsed.has(row.id);
                return (
                  <Fragment key={row.id}>
                    <ReportTableRow
                      row={row}
                      columns={table.columns}
                      fields={fields}
                      timeFormat={timeFormat}
                      isExpanded={row.children ? isExpanded : undefined}
                      onToggle={row.children ? () => toggleRow(row.id) : undefined}
                      onCellPointerEnter={handleCellPointerEnter}
                      onCellPointerLeave={hideTooltip}
                      onCellClick={handleCellClick}
                      canLogWork={canLogWork}
                      onLogWork={handleLogWork}
                      issueHref={issueHref}
                      onOpenIssue={handleOpenRow}
                    />
                    {isExpanded &&
                      row.children?.map((child) => (
                        <ReportTableRow
                          key={child.id}
                          row={child}
                          columns={table.columns}
                          fields={fields}
                          timeFormat={timeFormat}
                          isChild
                          onCellPointerEnter={handleCellPointerEnter}
                          onCellPointerLeave={hideTooltip}
                          onCellClick={handleCellClick}
                          canLogWork={canLogWork}
                          onLogWork={handleLogWork}
                          issueHref={issueHref}
                          onOpenIssue={handleOpenRow}
                        />
                      ))}
                  </Fragment>
                );
              })}
            </tbody>

            <tfoot>
              <tr>
                <th scope="row" className={cx(styles.rowHeader, styles.stickyLeft)}>
                  Total
                </th>
                <td className={cx(styles.num, styles.total, styles.stickyTotal)}>{format(table.grandTotal)}</td>
                {fields.map((field) => (
                  <td key={field.id} />
                ))}
                {table.columns.map((column) => (
                  <td
                    key={column.key}
                    className={cx(styles.num, styles.periodCell, column.isWeekend && styles.weekend, column.isToday && styles.todayCell)}
                  >
                    {format(table.columnTotals[column.key] ?? 0)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {tooltip && (
        <WorklogTooltip
          anchor={tooltip.anchor}
          {...tooltip.data}
          timeFormat={timeFormat}
          // Agrupado por pessoa, o autor já é a linha pai.
          showAuthor={table.authorCount > 1 && groupBy !== 'user'}
        />
      )}

      {openCell && (
        <WorklogDialog
          row={openCell.row}
          column={openCell.column}
          // Da tabela atual, e não da aberta: reflete as edições salvas no modal.
          worklogs={findRow(table.rows, openCell.row.id)?.worklogs?.[openCell.column.key] ?? []}
          timeFormat={timeFormat}
          timeZone={timeZone}
          issueHref={issueHref}
          onOpenIssue={() => {
            setOpenCell(null);
            handleOpenRow(openCell.row);
          }}
          onAddWorklog={
            canLogWork && openCell.row.issue && isDateKey(openCell.column.key)
              ? () => {
                  if (openCell.row.issue && isDateKey(openCell.column.key)) {
                    openLogWork({ issue: openCell.row.issue, date: openCell.column.key });
                  }
                  setOpenCell(null);
                }
              : undefined
          }
          onClose={() => setOpenCell(null)}
        />
      )}

      {isRefreshing && <RefreshOverlay />}
    </div>
  );
}
