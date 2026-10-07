import { type Icon, Table } from '@phosphor-icons/react';
import { cx } from '../lib/cx';
import styles from './BrandLogo.module.css';
import { ToolIcon } from './ToolIcon';
import { TOOL_ICONS } from './tools';

export type BrandProduct = 'reports' | 'kanban' | 'spreadsheet' | 'metrics' | 'builder';

/** O ícone é o do menu; a planilha usa o do "Planilha" do seletor de visualização. */
const BRANDS: Record<BrandProduct, { name: string; icon: Icon }> = {
  reports: { name: 'Reports', icon: TOOL_ICONS.reports },
  kanban: { name: 'Kanban', icon: TOOL_ICONS.kanban },
  spreadsheet: { name: 'Spreadsheet', icon: Table },
  metrics: { name: 'Metrics', icon: TOOL_ICONS.metrics },
  builder: { name: 'Dashboard', icon: TOOL_ICONS.builder },
};

interface BrandLogoProps {
  product: BrandProduct;
  /** `sidebar`: tamanho maior; `compact`: para cabeçalhos e menus. */
  size?: 'sidebar' | 'compact';
  className?: string;
}

/** Marca de cada ferramenta: o ícone do menu e o nome (o logo do Time fica no SidebarHeader). */
export function BrandLogo({ product, size = 'sidebar', className }: BrandLogoProps) {
  const { name, icon } = BRANDS[product];
  return (
    <span className={cx(styles.logo, styles[size], className)}>
      <ToolIcon product={product} icon={icon} size={size === 'sidebar' ? 'large' : 'medium'} />
      <span className={styles.name}>{name}</span>
    </span>
  );
}
