import type { MetricsModel } from '../lib/buildMetrics';
import { formatPercent, formatTotalHours } from '../lib/format';
import { BarList, type BarListItem } from './BarList';
import { ChartCard } from './ChartCard';
import styles from './ProjectHoursCard.module.css';

/** Projetos mostrados um a um; o resto vira "Outros projetos". */
const SHOWN_PROJECTS = 7;

/** Para onde foram as horas da equipe no mês: as squads e os demais projetos. */
export function ProjectHoursCard({ model }: { model: MetricsModel }) {
  const total = model.team.seconds;
  // Sem squad escolhida, nenhum projeto fica em destaque (são todos "outros").
  const squadCount = model.projects.filter((project) => project.isSquad).length;
  const shown = model.projects.slice(0, SHOWN_PROJECTS);
  const rest = model.projects.slice(SHOWN_PROJECTS);
  const share = (seconds: number) => formatPercent(total > 0 ? seconds / total : undefined);

  const items: BarListItem[] = shown.map((project) => ({
    id: project.key,
    label: (
      <>
        <span className={styles.name}>{project.name}</span>
        <span className={styles.key}>{project.key}</span>
      </>
    ),
    value: project.seconds,
    valueLabel: formatTotalHours(project.seconds),
    detail: share(project.seconds),
    tone: project.isSquad || squadCount === 0 ? 'accent' : 'muted',
  }));
  if (rest.length > 0) {
    const seconds = rest.reduce((sum, project) => sum + project.seconds, 0);
    items.push({
      id: 'others',
      label: <span className={styles.name}>Outros {rest.length} projetos</span>,
      value: seconds,
      valueLabel: formatTotalHours(seconds),
      detail: share(seconds),
      tone: 'muted',
    });
  }
  const hasOthers = model.projects.some((project) => !project.isSquad);

  return (
    <ChartCard
      title="Horas por projeto"
      subtitle="Onde a equipe lançou as horas do mês."
      legend={
        hasOthers && squadCount > 0
          ? [
              { label: squadCount > 1 ? 'Squads' : 'Squad', swatch: 'bar' },
              { label: 'Outros projetos', swatch: 'muted-bar' },
            ]
          : undefined
      }
    >
      {items.length > 0 ? <BarList items={items} label="Horas por projeto" /> : <p className={styles.empty}>Nenhuma hora no mês.</p>}
    </ChartCard>
  );
}
