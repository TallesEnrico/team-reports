import { formatDayMonth, formatWeekdayLong, weekdayOf } from '../../../lib/dates';
import type { MetricsModel } from '../lib/buildMetrics';
import { formatHours, plural } from '../lib/format';
import { ChartCard, ChartTable } from './ChartCard';
import { ChartTooltipContent, type TooltipRow } from './ChartTooltipContent';
import { type ColumnDatum, ColumnChart } from './ColumnChart';

interface DailyHoursChartProps {
  model: MetricsModel;
  className?: string;
}

/** Horas da equipe em cada dia do mês, com o esperado (jornada × pessoas) nos dias úteis. */
export function DailyHoursChart({ model, className }: DailyHoursChartProps) {
  const peopleCount = model.people.length;

  const data = model.daily.map((day, index): ColumnDatum => {
    const info = model.days[index];
    const dayName = `${formatWeekdayLong(day.date)}, ${formatDayMonth(day.date)}`;
    const rows: TooltipRow[] = [{ label: 'lançadas', value: formatHours(day.seconds), mark: 'bar' }];
    if (info.isWorkday) rows.push({ label: 'esperadas', value: formatHours(day.expectedSeconds), mark: 'line' });
    if (info.isWorkday && info.isElapsed) {
      rows.push({ label: `de ${peopleCount} lançaram`, value: String(day.peopleLogged) });
      if (day.peopleMissing > 0) rows.push({ label: 'sem lançar', value: String(day.peopleMissing), mark: 'missing' });
    }
    const note = info.holiday ?? (!info.isWorkday ? 'Fim de semana' : info.isToday ? 'Hoje: o dia ainda não terminou' : undefined);
    return {
      id: day.date,
      // Dia 1 e as segundas-feiras: o resto fica no tooltip e na tabela.
      axisLabel: index === 0 || weekdayOf(day.date) === 1 ? day.date.slice(8) : '',
      value: day.seconds,
      reference: info.isWorkday ? day.expectedSeconds : undefined,
      isOff: !info.isWorkday,
      ariaLabel: `${dayName}: ${formatHours(day.seconds)} lançadas${info.isWorkday ? ` de ${formatHours(day.expectedSeconds)} esperadas` : ''}`,
      tooltip: <ChartTooltipContent title={dayName} rows={rows} note={note} />,
    };
  });

  const table = (
    <ChartTable
      head={['Dia', 'Lançado', 'Esperado', 'Sem lançar']}
      rows={model.daily.map((day, index) => {
        const info = model.days[index];
        return [
          `${formatDayMonth(day.date)} ${formatWeekdayLong(day.date)}`,
          formatHours(day.seconds),
          info.isWorkday ? formatHours(day.expectedSeconds) : (info.holiday ?? '—'),
          info.isWorkday && info.isElapsed ? day.peopleMissing : '—',
        ];
      })}
    />
  );

  return (
    <ChartCard
      className={className}
      title="Horas por dia"
      subtitle={`Esperado nos dias úteis: ${formatHours(model.targetSeconds)} × ${plural(peopleCount, 'pessoa', 'pessoas')}. Fins de semana e feriados nacionais em cinza.`}
      legend={[
        { label: 'Lançadas', swatch: 'bar' },
        { label: 'Esperadas', swatch: 'line' },
      ]}
      table={table}
    >
      <ColumnChart data={data} label="Horas lançadas por dia" />
    </ChartCard>
  );
}
