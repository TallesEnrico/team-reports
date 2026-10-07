import { ToolNavList } from '../../../components/ToolNavList';
import styles from './HomeMenu.module.css';

/** Na página inicial, a lateral vira o menu das ferramentas. */
export function HomeMenu() {
  return (
    <nav aria-label="Ferramentas">
      <p className={styles.heading}>Ferramentas</p>
      <ToolNavList />
    </nav>
  );
}
