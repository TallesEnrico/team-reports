import { ArrowClockwise, Printer } from '@phosphor-icons/react';
import { BrandLogo } from '../../../components/BrandLogo';
import { Button } from '../../../components/Button';
import styles from './MetricsHeader.module.css';

interface MetricsHeaderProps {
  meta: string[];
  isRefreshing: boolean;
  canRefresh: boolean;
  onRefresh: () => void;
  canPrint: boolean;
}

export function MetricsHeader({ meta, isRefreshing, canRefresh, onRefresh, canPrint }: MetricsHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.titles}>
        <BrandLogo product="metrics" size="compact" />
        <p className={styles.meta}>
          {meta.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </p>
      </div>
      <div className={styles.actions}>
        {/* A impressão esconde a lateral e os botões: dá para salvar o painel em PDF. */}
        <Button
          variant="ghost"
          icon={<Printer size={16} weight="bold" />}
          onClick={() => window.print()}
          disabled={!canPrint}
          title="Imprimir ou salvar o painel em PDF"
          className="bg-tint!"
        >
          Imprimir
        </Button>
        <Button
          variant="ghost"
          icon={<ArrowClockwise size={16} weight="bold" className={isRefreshing ? styles.spinning : undefined} />}
          onClick={onRefresh}
          disabled={!canRefresh || isRefreshing}
          title="Buscar os apontamentos de novo no Jira"
          className="bg-tint!"
        >
          Atualizar
        </Button>
      </div>
    </header>
  );
}
