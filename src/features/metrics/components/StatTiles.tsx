import { ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { formatDayMonth } from '../../../lib/dates';
import { cx } from '../../../lib/cx';
import type { MetricsModel } from '../lib/buildMetrics';
import { formatPercent, formatPoints, formatTotalHours, plural } from '../lib/format';
import { formatMonthShort } from '../lib/months';
import type { PersonFilter } from '../types';
import styles from './StatTiles.module.css';

interface StatTileProps {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  /** Situação (ícone + cor) quando o número é um alerta. */
  status?: 'good' | 'alert';
  /** 0–1: barra de progresso (cobertura). */
  meter?: number;
  delta?: { text: string; direction: 'up' | 'down' | 'flat' };
  /** Recorte da lista de pessoas que o cartão aplica ao clicar. */
  filter?: PersonFilter;
  activeFilter: PersonFilter;
  onFilter: (filter: PersonFilter) => void;
}

const DELTA_ICONS = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight };

function StatTile({ label, value, caption, status, meter, delta, filter, activeFilter, onFilter }: StatTileProps) {
  const DeltaIcon = delta && DELTA_ICONS[delta.direction];
  const content = (
    <>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>
        {status === 'alert' && <WarningCircle size={20} weight="bold" className={styles.alertIcon} aria-label="Atenção" />}
        {status === 'good' && <CheckCircle size={20} weight="bold" className={styles.goodIcon} aria-label="Tudo certo" />}
        {value}
      </span>
      {meter !== undefined && (
        <span className={styles.meter} aria-hidden>
          <span style={{ width: `${Math.min(meter, 1) * 100}%` }} />
        </span>
      )}
      {delta && DeltaIcon && (
        <span className={styles.delta} data-direction={delta.direction}>
          <DeltaIcon size={13} weight="bold" aria-hidden />
          {delta.text}
        </span>
      )}
      {caption && <span className={styles.caption}>{caption}</span>}
      {filter && <span className={styles.action}>{activeFilter === filter ? 'Mostrando na lista' : 'Ver na lista'}</span>}
    </>
  );

  if (!filter) return <div className={styles.tile}>{content}</div>;
  return (
    <button
      type="button"
      className={cx(styles.tile, styles.clickable)}
      aria-pressed={activeFilter === filter}
      onClick={() => onFilter(activeFilter === filter ? 'all' : filter)}
    >
      {content}
    </button>
  );
}

interface StatTilesProps {
  model: MetricsModel;
  personFilter: PersonFilter;
  onPersonFilterChange: (filter: PersonFilter) => void;
}

/** Os números do mês: horas, cobertura da jornada, quem está sem lançar e as issues trabalhadas. */
export function StatTiles({ model, personFilter, onPersonFilterChange }: StatTilesProps) {
  const { team, people, lastWorkday } = model;
  const withMissing = people.filter((person) => person.missingDays.length > 0);
  const missingDays = withMissing.reduce((sum, person) => sum + person.missingDays.length, 0);

  const previous = team.previous;
  const delta =
    previous?.coverage !== undefined && team.coverage !== undefined
      ? (() => {
          const points = team.coverage - previous.coverage;
          const rounded = Math.round(points * 100);
          return {
            text: `${formatPoints(points)} vs ${formatMonthShort(previous.month)}`,
            direction: rounded > 0 ? ('up' as const) : rounded < 0 ? ('down' as const) : ('flat' as const),
          };
        })()
      : undefined;
  const tileProps = { activeFilter: personFilter, onFilter: onPersonFilterChange };

  return (
    <section className={styles.tiles} aria-label="Resumo do mês">
      <StatTile
        {...tileProps}
        label="Horas lançadas"
        value={formatTotalHours(team.seconds)}
        caption={
          lastWorkday
            ? `de ${formatTotalHours(team.expectedSeconds)} esperadas até ${formatDayMonth(lastWorkday)}`
            : 'nenhum dia útil do mês terminou ainda'
        }
      />
      <StatTile
        {...tileProps}
        label="Cobertura da jornada"
        value={formatPercent(team.coverage)}
        meter={team.coverage}
        delta={delta}
        caption={model.elapsedWorkdays < model.totalWorkdays ? `${model.elapsedWorkdays} de ${model.totalWorkdays} dias úteis decorridos` : `${model.totalWorkdays} dias úteis`}
      />
      {lastWorkday && (
        <StatTile
          {...tileProps}
          label="Dias sem lançamento"
          value={missingDays}
          status={missingDays > 0 ? 'alert' : 'good'}
          caption={missingDays > 0 ? `dias úteis vazios, de ${plural(withMissing.length, 'pessoa', 'pessoas')}` : 'todo dia útil tem apontamento'}
          filter={missingDays > 0 ? 'missing-days' : undefined}
        />
      )}
      <StatTile
        {...tileProps}
        label="Issues trabalhadas"
        value={team.issuesWorked}
        caption={`${team.issuesDone} concluídas · ${team.issuesInProgress} em andamento`}
      />
    </section>
  );
}
