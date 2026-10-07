import { ArrowRight } from '@phosphor-icons/react';
import { type CSSProperties } from 'react';
import { Link } from 'react-router';
import { useCurrentUserQuery } from '../../../api/useCurrentUserQuery';
import { AppShell } from '../../../components/AppShell';
import { BrandLogo } from '../../../components/BrandLogo';
import { IssueDialog } from '../../../components/IssueDialog';
import { Notice } from '../../../components/Notice';
import { SidebarHeader } from '../../../components/SidebarHeader';
import { ThemeToggle } from '../../../components/ThemeToggle';
import { TOOLS } from '../../../components/tools';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { useOpenIssue } from '../../../hooks/useOpenIssue';
import { defaultReportTimeZone, isReportTimeZone } from '../../../lib/timeZones';
import { useJiraConnectionStore } from '../../../store/useJiraConnectionStore';
import { ConnectionStatus } from '../../jira-connection/components/ConnectionStatus';
import { ConnectedPeople } from './ConnectedPeople';
import { HomeFooter } from './HomeFooter';
import { HomeMenu } from './HomeMenu';
import { HomeMetrics } from './HomeMetrics';
import styles from './HomePage.module.css';
import { ToolPreview } from './ToolPreview';

const todayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

export function HomePage() {
  useDocumentTitle('Início');
  const user = useCurrentUserQuery().data;
  const squad = useJiraConnectionStore((state) => state.credentials?.squad);
  const firstName = user?.displayName.split(/\s+/)[0];
  const timeZone = isReportTimeZone(user?.timeZone) ? user.timeZone : defaultReportTimeZone();
  const openIssue = useOpenIssue();

  return (
    <AppShell
      sidebar={
        <>
          <SidebarHeader />
          <HomeMenu />
        </>
      }
      sidebarFooter={<ConnectionStatus />}
      mainClassName={styles.main}
    >
      <div className={styles.page}>
        <div className={styles.introBlock}>
          <div className={styles.introRow}>
            <header className={styles.intro}>
              <p className={styles.eyebrow}>
                <span>{todayFormatter.format(new Date())}</span>
                {squad && <span className={styles.squad}>Squad {squad}</span>}
              </p>
              <h1 className={styles.title}>{firstName ? `Olá, ${firstName}.` : 'Olá.'}</h1>
            </header>
            <div className={styles.introTools}>
              <ConnectedPeople />
              <ThemeToggle />
            </div>
          </div>
          <div className={styles.leadRow}>
            <p className={styles.lead}>
              Ferramentas do Time sobre o Jira: as horas lançadas, o quadro da squad, os indicadores do mês e os
              dashboards que você monta. Escolha por onde começar.
            </p>
            {user && (
              <HomeMetrics
                accountId={user.accountId}
                timeZone={timeZone}
                onOpenIssue={openIssue.open}
                hrefFor={openIssue.hrefFor}
              />
            )}
          </div>
        </div>

        {openIssue.failure && (
          <Notice tone="warning">
            Não foi possível abrir a issue {openIssue.failure.key}: {openIssue.failure.message}
          </Notice>
        )}

        <ul className={styles.grid}>
          {TOOLS.map((tool, index) => (
            <li
              key={tool.to}
              className={styles.cell}
              data-product={tool.product}
              style={{ '--index': index } as CSSProperties}
            >
              <Link to={tool.to} className={styles.card}>
                <span className={styles.cardHead}>
                  <BrandLogo product={tool.product} size="compact" />
                  <span className={styles.arrow} aria-hidden>
                    <ArrowRight size={15} weight="bold" />
                  </span>
                </span>
                <span className={styles.tagline}>
                  <span className={styles.dot} aria-hidden />
                  {tool.tagline}
                </span>
                <span className={styles.description}>{tool.description}</span>
                <ToolPreview product={tool.product} />
              </Link>
            </li>
          ))}
        </ul>

        <HomeFooter />
      </div>
      {openIssue.issue && (
        <IssueDialog
          key={openIssue.issue.id}
          issue={openIssue.issue}
          timeZone={timeZone}
          onOpenIssue={openIssue.open}
          onClose={openIssue.close}
        />
      )}
    </AppShell>
  );
}
