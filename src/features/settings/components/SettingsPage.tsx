import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { SidebarHeader } from '@/components/SidebarHeader';
import { ToolNavList } from '@/components/ToolNavList';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cx } from '@/lib/cx';
import { ConnectionStatus } from '@/features/jira-connection/components/ConnectionStatus';
import { AccountSquadSection } from './AccountSquadSection';
import { CopySiteLink } from './CopySiteLink';
import { AiSection } from './AiSection';
import { McpSection } from './McpSection';
import { LogWorkSection } from './LogWorkSection';
import { NotificationSection } from './NotificationSection';
import { PeerSharingSection } from './PeerSharingSection';
import styles from './SettingsPage.module.css';
import { ThemeSection } from './ThemeSection';

const MENUS = [
  {
    id: 'conta',
    label: 'Conta',
    lead: 'A squad da sua conta, o tema do app, as notificações, o lançamento de horas e a IA que monta dashboards.',
  },
  {
    id: 'conexoes',
    label: 'Conexões',
    lead: 'Envie dashboards e relatórios entre os navegadores do mesmo Jira.',
  },
  {
    id: 'mcp',
    label: 'MCP',
    lead: 'Instale o Team Reports no assistente de IA para usar o Jira por lá.',
  },
  {
    id: 'compartilhar',
    label: 'Compartilhar',
    lead: 'Mande o link deste site ou o JSON do Jira, para quem for se conectar.',
  },
] as const;

type MenuId = (typeof MENUS)[number]['id'];

export function SettingsPage() {
  useDocumentTitle('Configurações');
  const [menu, setMenu] = useState<MenuId>('conta');
  const current = MENUS.find((item) => item.id === menu) ?? MENUS[0];

  function moveMenu(from: MenuId, direction: 1 | -1) {
    const index = MENUS.findIndex((item) => item.id === from);
    const next = MENUS[(index + direction + MENUS.length) % MENUS.length];
    setMenu(next.id);
    document.getElementById(`settings-menu-${next.id}`)?.focus();
  }

  return (
    <AppShell
      sidebar={
        <>
          <SidebarHeader />
          <nav aria-label="Ferramentas">
            <p className={styles.menuHeading}>Ferramentas</p>
            <ToolNavList />
          </nav>
        </>
      }
      sidebarFooter={<ConnectionStatus />}
      mainClassName={styles.main}
    >
      <div className={styles.page}>
        <header className={styles.intro}>
          <h1 className={styles.title}>Configurações</h1>
          <p className={styles.lead}>{current.lead}</p>
        </header>
        <div className={styles.menus} role="tablist" aria-label="Seções de configurações">
          {MENUS.map((item) => (
            <button
              key={item.id}
              id={`settings-menu-${item.id}`}
              type="button"
              role="tab"
              className={cx(styles.menu, menu === item.id && styles.menuActive)}
              aria-selected={menu === item.id}
              aria-controls={`settings-panel-${item.id}`}
              tabIndex={menu === item.id ? 0 : -1}
              onClick={() => setMenu(item.id)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                event.preventDefault();
                moveMenu(item.id, event.key === 'ArrowRight' ? 1 : -1);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div
          id={`settings-panel-${current.id}`}
          role="tabpanel"
          aria-labelledby={`settings-menu-${current.id}`}
          className={styles.panel}
        >
          {menu === 'conta' && (
            <>
              <ThemeSection />
              <NotificationSection />
              <LogWorkSection />
              <AiSection />
              <AccountSquadSection />
            </>
          )}
          {menu === 'conexoes' && <PeerSharingSection />}
          {menu === 'mcp' && <McpSection />}
          {menu === 'compartilhar' && <CopySiteLink />}
        </div>
      </div>
    </AppShell>
  );
}
