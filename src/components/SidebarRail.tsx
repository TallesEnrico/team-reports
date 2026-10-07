import { NavLink } from 'react-router';
import { cx } from '../lib/cx';
import { JiraSiteFavicon } from './JiraSiteLogo';
import { SignOutButton } from './SignOutButton';
import { ToolNavList } from './ToolNavList';
import styles from './SidebarRail.module.css';

interface SidebarRailProps {
  collapsed: boolean;
  className?: string;
}

export function SidebarRail({ collapsed, className }: SidebarRailProps) {
  return (
    <div className={cx(styles.rail, className)} inert={!collapsed} aria-hidden={!collapsed || undefined}>
      <NavLink to="/" end className={styles.brand} aria-label="Início" title="Início">
        <JiraSiteFavicon alt="" className={styles.favicon} />
      </NavLink>
      <nav className={styles.menu} aria-label="Ferramentas">
        <ToolNavList iconsOnly />
      </nav>
      <div className={styles.signOut}>
        <SignOutButton iconOnly />
      </div>
    </div>
  );
}
