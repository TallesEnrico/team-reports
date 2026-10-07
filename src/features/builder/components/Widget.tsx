import { CircleNotch, PencilSimple, PuzzlePiece, WarningCircle } from '@phosphor-icons/react';
import { useId, useState } from 'react';
import { Button } from '../../../components/Button';
import { cx } from '../../../lib/cx';
import { dataMeta, sourceNodeOf, widgetTitle } from '../lib/describe';
import { PIECES } from '../lib/catalog';
import type { BuilderNode, Dataset, PieceResult, VisualConfig, VisualKind } from '../types';
import { BarsChart } from './BarsChart';
import { useBuilderContext } from './BuilderContext';
import { ColumnsChart } from './ColumnsChart';
import { DataTable } from './DataTable';
import { HeatmapChart } from './HeatmapChart';
import { NumberView } from './NumberView';
import styles from './Widget.module.css';

type VisualNode = Extract<BuilderNode, { type: VisualKind }>;

interface WidgetProps {
  node: VisualNode;
  result: PieceResult | undefined;
  /** `dashboard`: o bloco no dashboard; `preview`: a prévia no painel da peça. */
  variant?: 'dashboard' | 'preview';
  className?: string;
}

/** Gráfico ou tabela de uma peça de visualização, conforme o tipo dela. */
export function WidgetBody({ kind, config, data }: { kind: VisualKind; config: VisualConfig; data: Dataset }) {
  if (kind === 'number') return <NumberView data={data} config={config} />;
  if (kind === 'table' || data.kind !== 'aggregate') return <DataTable data={data} />;
  if (kind === 'bars') return <BarsChart data={data} />;
  if (kind === 'columns') return <ColumnsChart data={data} />;
  return <HeatmapChart data={data} colors={config.heat} />;
}

/** Bloco do dashboard: título, de onde vêm os números, o gráfico (ou a tabela) e o "Editar". */
export function Widget({ node, result, variant = 'dashboard', className }: WidgetProps) {
  const context = useBuilderContext();
  const titleId = useId();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const data = result?.state === 'ready' ? result.data : undefined;
  // Buscando de novo (ex: outro período): os números anteriores ficam, esmaecidos, até os novos chegarem.
  const isStale = result?.state === 'ready' && Boolean(result.isStale);
  const title = widgetTitle(node.type, node.data, data) || PIECES[node.type].name;
  const meta = dataMeta(sourceNodeOf(node.id, context.nodes, context.edges), data, context.connectedSquad);
  const canToggle = data?.kind === 'aggregate' && node.type !== 'number' && node.type !== 'table';
  const Icon = PIECES[node.type].icon;

  let body;
  if (!result || result.state === 'loading') {
    body = (
      <p className={styles.status} role="status">
        <CircleNotch size={16} weight="bold" className={styles.spinning} aria-hidden /> Buscando no Jira…
      </p>
    );
  } else if (result.state === 'error') {
    body = (
      <p className={cx(styles.status, styles.error)} role="alert">
        <WarningCircle size={16} weight="bold" aria-hidden /> {result.message}
      </p>
    );
  } else if (result.state === 'idle') {
    body = (
      <p className={styles.status}>
        <PuzzlePiece size={16} weight="bold" aria-hidden /> {result.message}
      </p>
    );
  } else {
    body =
      view === 'table' && canToggle ? (
        <DataTable data={result.data} />
      ) : (
        <WidgetBody kind={node.type} config={node.data} data={result.data} />
      );
  }

  return (
    <figure
      className={cx(styles.card, className)}
      data-variant={variant}
      data-kind={node.type}
      data-stale={isStale || undefined}
      aria-labelledby={titleId}
      aria-busy={isStale || undefined}
    >
      <header className={styles.header}>
        <div className={styles.titles}>
          <h2 id={titleId} className={styles.title}>
            {variant === 'dashboard' && node.type !== 'number' && <Icon size={15} weight="bold" className={styles.icon} aria-hidden />}
            {title}
          </h2>
          {meta.length > 0 && (
            <p className={styles.meta}>
              {meta.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </p>
          )}
        </div>
        <div className={styles.actions}>
          {/* O "Atualizando…" com texto fica no topo do dashboard; aqui, só o sinal no canto do bloco. */}
          {isStale && (
            <span className={styles.updating} title="Atualizando…">
              <CircleNotch size={14} weight="bold" className={styles.spinning} aria-hidden />
            </span>
          )}
          {canToggle && (
            <div className={styles.toggle} role="group" aria-label="Ver como">
              <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')}>
                Gráfico
              </button>
              <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>
                Tabela
              </button>
            </div>
          )}
          {variant === 'dashboard' && (
            <Button
              variant="ghost"
              className={styles.edit}
              icon={<PencilSimple size={14} weight="bold" aria-hidden />}
              aria-label={`Editar a peça "${title}"`}
              title="Editar a peça no quadro de montagem"
              onClick={() => context.editPiece(node.id)}
            />
          )}
        </div>
      </header>
      {result?.state === 'ready' && result.note && <p className={styles.note}>{result.note}</p>}
      <div className={styles.body}>{body}</div>
    </figure>
  );
}
