import { PuzzlePiece } from '@phosphor-icons/react';
import { type CSSProperties, useMemo } from 'react';
import { Button } from '../../../components/Button';
import { PageMessage } from '../../../components/PageMessage';
import { RefreshOverlay } from '../../../components/RefreshOverlay';
import { isVisualKind } from '../lib/catalog';
import { dashboardOrder } from '../lib/graph';
import type { BuilderNode, VisualKind } from '../types';
import { useBuilderContext } from './BuilderContext';
import styles from './DashboardView.module.css';
import { Widget } from './Widget';

type VisualNode = Extract<BuilderNode, { type: VisualKind }>;

interface DashboardViewProps {
  onBuild: () => void;
}

/**
 * O dashboard montado: um bloco por peça de visualização, na posição delas no
 * quadro (de cima para baixo, da esquerda para a direita).
 */
export function DashboardView({ onBuild }: DashboardViewProps) {
  const { nodes, results } = useBuilderContext();
  const widgets = useMemo(
    () => dashboardOrder(nodes.filter((node): node is VisualNode => isVisualKind(node.type))),
    [nodes],
  );

  if (widgets.length === 0) {
    return (
      <PageMessage tone="neutral" icon={<PuzzlePiece size={20} weight="bold" />} title="O dashboard ainda não tem blocos">
        <p>Cada peça de "Mostrar" (Número, Barras, Colunas, Mapa de calor, Tabela) vira um bloco aqui.</p>
        <Button variant="primary" className={styles.cta} onClick={onBuild}>
          Montar o dashboard
        </Button>
      </PageMessage>
    );
  }

  // Buscando de novo (ex: outro período): um aviso só, preso no topo, e os blocos esmaecidos.
  const isRefreshing = widgets.some((node) => {
    const result = results[node.id];
    return result?.state === 'ready' && result.isStale;
  });

  return (
    <div className={styles.view}>
      {isRefreshing && (
        <div className={styles.refreshing}>
          <RefreshOverlay />
        </div>
      )}
      <div className={styles.grid}>
      {widgets.map((node, index) => (
        // Largura na grade de 12 colunas e a entrada escalonada.
        <div key={node.id} className={styles.cell} data-width={node.data.width} style={{ '--index': index } as CSSProperties}>
          <Widget node={node} result={results[node.id]} className={styles.widget} />
        </div>
      ))}
      </div>
    </div>
  );
}
