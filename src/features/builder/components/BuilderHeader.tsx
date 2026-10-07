import { ArrowClockwise, Printer, Sparkle } from '@phosphor-icons/react';
import { BrandLogo } from '../../../components/BrandLogo';
import { Button } from '../../../components/Button';
import { useBuilderStore } from '../store/useBuilderStore';
import type { BuilderMode, Dashboard } from '../types';
import styles from './BuilderHeader.module.css';
import { DashboardNameField } from './DashboardNameField';
import { DashboardPeriodPicker } from './DashboardPeriodPicker';
import { ModeToggle } from './ModeToggle';

interface BuilderHeaderProps {
  dashboard: Dashboard | undefined;
  mode: BuilderMode;
  isRefreshing: boolean;
  canRefresh: boolean;
  onRefresh: () => void;
  /** "Editar com IA": muda o dashboard aberto a partir de um pedido. */
  onEditWithAi: () => void;
}

/**
 * Cabeçalho do Dashboard: a marca, o nome do dashboard aberto, "Montar |
 * Dashboard", o período, "Editar com IA" e "Atualizar". Importar fica no seletor
 * de dashboards, na lateral; duplicar, exportar e excluir, nas opções de cada dashboard dele.
 */
export function BuilderHeader({ dashboard, mode, isRefreshing, canRefresh, onRefresh, onEditWithAi }: BuilderHeaderProps) {
  const setMode = useBuilderStore((state) => state.setMode);
  const renameDashboard = useBuilderStore((state) => state.renameDashboard);
  const setDashboardPeriod = useBuilderStore((state) => state.setDashboardPeriod);
  // Peças de dados com período próprio (não seguem o seletor). Issues abertas não usam período.
  const ownPeriodPieces =
    dashboard?.nodes.filter(
      (node) =>
        (node.type === 'worklogs' || (node.type === 'issues' && node.data.selection !== 'open')) &&
        node.data.period.preset !== 'dashboard',
    ).length ?? 0;

  return (
    <header className={`${styles.header} nokey`}>
      <div className={styles.titles}>
        <BrandLogo product="builder" size="compact" />
        {dashboard && (
          <DashboardNameField name={dashboard.name} onRename={(name) => renameDashboard(dashboard.id, name)} />
        )}
      </div>
      <div className={styles.actions}>
        <ModeToggle value={mode} onChange={setMode} />
        {dashboard && (
          <DashboardPeriodPicker value={dashboard.period} onChange={setDashboardPeriod} ownPeriodPieces={ownPeriodPieces} />
        )}
        <span className={styles.divider} aria-hidden />
        {dashboard && mode !== 'view' && (
          <Button
            variant="ghost"
            icon={<Sparkle size={16} weight="fill" aria-hidden />}
            onClick={onEditWithAi}
            title="Pedir uma mudança neste dashboard à IA"
            className="bg-tint!"
          >
            Editar com IA
          </Button>
        )}
        {mode === 'view' && (
          <Button
            variant="ghost"
            icon={<Printer size={16} weight="bold" aria-hidden />}
            onClick={() => window.print()}
            title="Imprimir ou salvar o dashboard em PDF"
            className="bg-tint!"
          >
            Imprimir
          </Button>
        )}
        <Button
          variant="ghost"
          icon={<ArrowClockwise size={16} weight="bold" className={isRefreshing ? styles.spinning : undefined} aria-hidden />}
          onClick={onRefresh}
          disabled={!canRefresh || isRefreshing}
          title="Buscar os dados de novo no Jira"
          className="bg-tint!"
        >
          Atualizar
        </Button>
      </div>
    </header>
  );
}
