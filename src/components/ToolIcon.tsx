import type { Icon } from '@phosphor-icons/react';
import { cx } from '../lib/cx';
import type { BrandProduct } from './BrandLogo';
import styles from './ToolIcon.module.css';

const ICON_SIZES = { small: 16, medium: 18, large: 22 } as const;

interface ToolIconProps {
  /** Define a cor: a de cada ferramenta (a planilha usa a do Kanban); início e Configurações, neutras. */
  product: BrandProduct | 'home' | 'settings';
  icon: Icon;
  /** `small`: menu da logo; `medium`: menu da lateral e cabeçalhos; `large`: marca maior. */
  size?: keyof typeof ICON_SIZES;
  className?: string;
}

/** Ícone de uma ferramenta num quadrado com a cor dela (menus e marca do cabeçalho). */
export function ToolIcon({ product, icon: Icon, size = 'medium', className }: ToolIconProps) {
  return (
    <span className={cx(styles.icon, styles[size], className)} data-product={product} aria-hidden>
      <Icon size={ICON_SIZES[size]} weight="bold" />
    </span>
  );
}
