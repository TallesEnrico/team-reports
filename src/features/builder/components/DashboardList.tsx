import { Copy, DotsThree, DownloadSimple, Plus, ShareNetwork, SquaresFour, Trash, UploadSimple } from '@phosphor-icons/react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../../components/Button';
import { type MenuItem, MenuButton } from '../../../components/MenuButton';
import { cx } from '../../../lib/cx';
import { isVisualKind } from '../lib/catalog';
import { plural } from '../lib/format';
import { useActiveDashboard, useBuilderStore } from '../store/useBuilderStore';
import type { Dashboard } from '../types';
import { useBuilderContext } from './BuilderContext';
import { DeleteDashboardDialog } from './DeleteDashboardDialog';
import { DuplicateDashboardDialog } from './DuplicateDashboardDialog';
import styles from './DashboardList.module.css';
import { NewDashboardDialog } from './NewDashboardDialog';
import { ShareDashboardDialog } from './ShareDashboardDialog';

/**
 * O seletor de dashboards: "Importar" e "Novo" logo abaixo do título (lado a
 * lado se a lateral couber), e a lista dos salvos neste navegador, cada um com
 * as opções dele ("⋯"): compartilhar, duplicar, exportar e excluir.
 */
export function DashboardList() {
  const dashboards = useBuilderStore((state) => state.dashboards);
  const selectDashboard = useBuilderStore((state) => state.selectDashboard);
  const { importDashboardFile, exportDashboard } = useBuilderContext();
  const active = useActiveDashboard();
  const [isCreating, setIsCreating] = useState(false);
  const [deleting, setDeleting] = useState<Dashboard | null>(null);
  const [duplicating, setDuplicating] = useState<Dashboard | null>(null);
  const [sharing, setSharing] = useState<Dashboard | null>(null);

  // As opções de cada linha valem para o dashboard dela (aberto ou não).
  function optionsOf(dashboard: Dashboard): MenuItem[] {
    return [
      {
        id: 'share',
        label: 'Compartilhar',
        description: 'Compartilhe este dashboard',
        icon: <ShareNetwork size={16} weight="bold" aria-hidden />,
        onSelect: () => setSharing(dashboard),
      },
      {
        id: 'duplicate',
        label: 'Duplicar',
        description: 'Faça uma cópia com a mesma configuração.',
        icon: <Copy size={16} weight="bold" aria-hidden />,
        onSelect: () => setDuplicating(dashboard),
      },
      {
        id: 'export',
        label: 'Exportar',
        description: 'Baixe a configuração do dashboard em json',
        icon: <DownloadSimple size={16} weight="bold" aria-hidden />,
        onSelect: () => exportDashboard(dashboard),
      },
      {
        id: 'delete',
        label: 'Excluir',
        description: 'Apaga este dashboard deste navegador.',
        icon: <Trash size={16} weight="bold" aria-hidden />,
        tone: 'danger',
        onSelect: () => setDeleting(dashboard),
      },
    ];
  }

  return (
    <section className={styles.section} aria-labelledby="builder-dashboards-title">
      <h2 id="builder-dashboards-title" className={styles.heading}>
        Meus dashboards
      </h2>
      <div className={styles.actions}>
        <Button
          variant="secondary"
          className={styles.action}
          icon={<UploadSimple size={15} weight="bold" aria-hidden />}
          title="Abrir um dashboard exportado (.json), seu ou de outra pessoa. Vira um dashboard novo."
          onClick={importDashboardFile}
        >
          Importar
        </Button>
        <Button
          variant="primary"
          className={`${styles.action} dark:bg-gray-300! dark:hover:bg-gray-100!`}
          icon={<Plus size={15} weight="bold" aria-hidden />}
          onClick={() => setIsCreating(true)}
        >
          Novo
        </Button>
      </div>
      <ul className={styles.list}>
        {dashboards.map((dashboard) => {
          const blocks = dashboard.nodes.filter((node) => isVisualKind(node.type)).length;
          const isActive = dashboard.id === active?.id;
          return (
            <li key={dashboard.id} className={cx(styles.row, isActive && styles.active)}>
              <button
                type="button"
                className={styles.item}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => selectDashboard(dashboard.id)}
              >
                <SquaresFour size={15} weight={isActive ? 'fill' : 'bold'} className={styles.icon} aria-hidden />
                <span className={styles.text}>
                  <span className={styles.name}>{dashboard.name}</span>
                  <span className={styles.meta}>{plural(blocks, 'bloco', 'blocos')}</span>
                </span>
              </button>
              <MenuButton
                iconOnly
                label={`Opções de "${dashboard.name}"`}
                icon={<DotsThree size={18} weight="bold" aria-hidden />}
                heading={dashboard.name}
                items={optionsOf(dashboard)}
                className={styles.options}
              />
            </li>
          );
        })}
      </ul>
      {/* No <body>, fora da lateral: focar um campo do modal não rola a lateral. `nokey`: as teclas não mexem nas peças. */}
      {(isCreating || deleting || duplicating || sharing) &&
        createPortal(
          <div className="nokey">
            {isCreating && <NewDashboardDialog onClose={() => setIsCreating(false)} />}
            {deleting && <DeleteDashboardDialog dashboard={deleting} onClose={() => setDeleting(null)} />}
            {duplicating && <DuplicateDashboardDialog dashboard={duplicating} onClose={() => setDuplicating(null)} />}
            {sharing && <ShareDashboardDialog dashboard={sharing} onClose={() => setSharing(null)} />}
          </div>,
          document.body,
        )}
    </section>
  );
}
