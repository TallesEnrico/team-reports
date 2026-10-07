import { Table } from '@phosphor-icons/react';
import { formatDateBR } from '../../../lib/dates';
import type { TimeFormat } from '../../../lib/formatDuration';
import { reportTimeZoneLabel } from '../../../lib/timeZones';
import type { SharedReport } from '../../team-reports/lib/shareLink';
import type { GroupBy, PeriodGrouping, Principal } from '../../team-reports/types';
import styles from './SharedReportSummary.module.css';

const GROUP_BY: Record<GroupBy, string> = {
  issue: 'Tarefa',
  parent: 'Tarefa pai',
  user: 'Pessoa',
  project: 'Projeto',
};

const PERIOD: Record<PeriodGrouping, string> = {
  day: 'Dia',
  week: 'Semana',
  month: 'Mês',
};

const TIME_FORMAT: Record<TimeFormat, string> = {
  'hours-minutes': 'Horas & Minutos',
  decimal: 'Horas Decimais',
  clock: 'Relógio (hh:mm)',
};

function personName(principal: Principal): string {
  if (principal.type === 'current-user') return 'Você';
  return principal.type === 'user' ? principal.displayName : principal.name;
}

function rows(report: SharedReport): [string, string][] {
  const { filters, display } = report;
  const facts: [string, string][] = [];
  if (filters.from && filters.to) facts.push(['Período', `${formatDateBR(filters.from)} – ${formatDateBR(filters.to)}`]);
  if (filters.projectKeys) {
    facts.push(['Projetos', filters.projectKeys.length > 0 ? filters.projectKeys.join(', ') : 'Todos os projetos']);
  }
  if (filters.principals) {
    facts.push(['Pessoas', filters.principals.length > 0 ? filters.principals.map(personName).join(', ') : 'Todas as pessoas']);
  }
  if (filters.jql !== undefined) facts.push(['JQL', filters.jql || 'Nenhum']);
  if (display.groupBy) facts.push(['Agrupar por', GROUP_BY[display.groupBy]]);
  if (display.period) facts.push(['Colunas', PERIOD[display.period]]);
  if (display.timeFormat) facts.push(['Formato', TIME_FORMAT[display.timeFormat]]);
  if (display.timeZone) facts.push(['Fuso', reportTimeZoneLabel(display.timeZone)]);
  if (filters.additionalFieldIds && filters.additionalFieldIds.length > 0) {
    const count = filters.additionalFieldIds.length;
    facts.push(['Campos extras', count === 1 ? '1 campo' : `${count} campos`]);
  }
  return facts;
}

export function SharedReportSummary({ report }: { report: SharedReport }) {
  return (
    <div className={styles.summary}>
      <div className={styles.card}>
        <span className={styles.icon} aria-hidden>
          <Table size={18} weight="bold" />
        </span>
        <span className={styles.name}>Relatório de horas</span>
      </div>
      <dl className={styles.facts}>
        {rows(report).map(([label, value]) => (
          <div key={label} className={styles.fact}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.note}>
        Vem o recorte: datas, projetos, pessoas, JQL e a configuração. As horas, não: aceitando, o relatório abre aqui e o Jira é
        consultado com a sua conta, com as suas permissões.
      </p>
    </div>
  );
}
