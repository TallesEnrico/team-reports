import { CircleNotch } from '@phosphor-icons/react';
import { AppShell } from '../../../components/AppShell';
import { BrandLogo } from '../../../components/BrandLogo';
import { PageMessage } from '../../../components/PageMessage';
import { SidebarHeader } from '../../../components/SidebarHeader';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { ConnectionStatus } from '../../jira-connection/components/ConnectionStatus';
import headerStyles from './BuilderHeader.module.css';
import styles from './BuilderPage.module.css';

/**
 * A moldura do Dashboard (lateral e cabeçalho com a marca) enquanto o editor
 * de peças é baixado ou os dashboards salvos são lidos: a tela não fica em branco.
 * Vai no pacote inicial (`App.tsx`), então não importa nada do editor (React Flow).
 */
export function BuilderPageFallback() {
  useDocumentTitle('Dashboard');
  return (
    <AppShell sidebar={<SidebarHeader />} sidebarFooter={<ConnectionStatus />} mainClassName={styles.main}>
      <header className={headerStyles.header}>
        <div className={headerStyles.titles}>
          <BrandLogo product="builder" size="compact" />
        </div>
      </header>
      <PageMessage tone="loading" icon={<CircleNotch size={20} weight="bold" />} title="Carregando o dashboard" />
    </AppShell>
  );
}
