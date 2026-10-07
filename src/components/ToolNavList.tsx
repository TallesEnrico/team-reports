import { CaretRight, GearSix, House } from '@phosphor-icons/react';
import { NavLink } from 'react-router';
import { cx } from '../lib/cx';
import { ToolIcon } from './ToolIcon';
import { SETTINGS_LINK, TOOL_ICONS, TOOLS } from './tools';
import styles from './ToolNavList.module.css';

interface ToolNavListProps {
  /** `compact`: no menu da logo, itens mais baixos. */
  size?: 'regular' | 'compact';
  /** Põe "Início" no topo (o menu da logo, fora da página inicial). */
  includeHome?: boolean;
  /** Depois de escolher um item (ex: fechar o menu). */
  onNavigate?: () => void;
  iconsOnly?: boolean;
}

/** Links das ferramentas e, no fim, Configurações, com ícone e uma linha cada; a tela aberta fica marcada. */
export function ToolNavList({ size = 'regular', includeHome = false, onNavigate, iconsOnly = false }: ToolNavListProps) {
  const items = [
    ...(includeHome
      ? [{ to: '/', name: 'Início', tagline: 'Todas as ferramentas', product: 'home' as const, Icon: House }]
      : []),
    ...TOOLS.map((tool) => ({ ...tool, Icon: TOOL_ICONS[tool.product] })),
    { ...SETTINGS_LINK, product: 'settings' as const, Icon: GearSix },
  ];

  return (
    <ul className={cx(styles.list, size === 'compact' && styles.compact, iconsOnly && styles.iconsOnly)}>
      {items.map(({ to, name, tagline, product, Icon }) => (
        <li key={to} className={cx(product === 'settings' && styles.settings)}>
          <NavLink to={to} end={to === '/'} className={styles.link} title={iconsOnly ? name : undefined} onClick={onNavigate}>
            <ToolIcon product={product} icon={Icon} size={size === 'compact' ? 'small' : 'medium'} />
            <span className={styles.text}>
              <span className={styles.name}>{name}</span>
              <span className={styles.tagline}>{tagline}</span>
            </span>
            <CaretRight size={14} weight="bold" className={styles.caret} aria-hidden />
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
