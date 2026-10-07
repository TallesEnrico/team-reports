import { JiraSiteFavicon } from '../../../components/JiraSiteLogo';
import styles from './HomeFooter.module.css';

/** Rodapé da página inicial: o Time e quem desenvolveu as ferramentas. */
export function HomeFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.brand}>
        <JiraSiteFavicon alt="Time" className={styles.groupLogo} />
        <p className={styles.text}>Ferramentas internas sobre o Jira · {new Date().getFullYear()}</p>
      </div>
    </footer>
  );
}
