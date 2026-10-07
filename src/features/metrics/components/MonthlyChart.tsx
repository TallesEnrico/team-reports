import type { MonthKey } from '../types';
import { formatHours, formatPercent, formatTotalHours } from '../lib/format';
import { formatMonthLong, formatMonthShort } from '../lib/months';
import { ChartCard, ChartTable } from './ChartCard';
import { ChartTooltipContent } from './ChartTooltipContent';
import { type ColumnDatum, ColumnChart } from './ColumnChart';

export interface MonthPoint {
  month: MonthKey;
  seconds: number;
  expectedSeconds: number;
  coverage?: number;
  /** Dias úteis já decorridos e do mês inteiro (só a equipe). */
  workdays?: { elapsed: number; total: number };
  isLoaded: boolean;
}

interface MonthlyChartProps {
  title: string;
  subtitle?: string;
  months: MonthPoint[];
  /** O mês escolhido, em destaque; os anteriores ficam em cinza. */
  selectedMonth: MonthKey;
  height?: number;
  className?: string;
}

/** Lançado contra o esperado em cada mês da comparação. */
export function MonthlyChart({ title, subtitle, months, selectedMonth, height = 180, className }: MonthlyChartProps) {
  const crossesYear = new Set(months.map((point) => point.month.slice(0, 4))).size > 1;
  // Cobertura sobre todas as colunas até 6 meses; com 12, só sobre o mês escolhido (o resto no tooltip e na tabela).
  const labelAll = months.length <= 6;

  const data = months.map((point): ColumnDatum => {
    const isSelected = point.month === selectedMonth;
    const isPartial = point.workdays && point.workdays.elapsed < point.workdays.total;
    return {
      id: point.month,
      axisLabel: formatMonthShort(point.month, crossesYear),
      value: point.seconds,
      reference: point.expectedSeconds,
      tone: isSelected ? 'accent' : 'muted',
      isPending: !point.isLoaded,
      capLabel: !point.isLoaded ? '…' : labelAll || isSelected ? formatPercent(point.coverage) : undefined,
      ariaLabel: point.isLoaded
        ? `${formatMonthLong(point.month)}: ${formatHours(point.seconds)} lançadas de ${formatHours(point.expectedSeconds)} esperadas (${formatPercent(point.coverage)})`
        : `${formatMonthLong(point.month)}: carregando`,
      tooltip: point.isLoaded ? (
        <ChartTooltipContent
          title={formatMonthLong(point.month)}
          rows={[
            { label: 'lançadas', value: formatHours(point.seconds), mark: isSelected ? 'bar' : 'muted-bar' },
            { label: 'esperadas', value: formatHours(point.expectedSeconds), mark: 'line' },
            { label: 'da jornada', value: formatPercent(point.coverage) },
            ...(point.workdays ? [{ label: 'dias úteis decorridos', value: `${point.workdays.elapsed} de ${point.workdays.total}` }] : []),
          ]}
          note={isPartial ? 'Mês em andamento: o esperado conta só os dias úteis que já passaram.' : undefined}
        />
      ) : (
        <ChartTooltipContent title={formatMonthLong(point.month)} rows={[]} note="Carregando os apontamentos do mês…" />
      ),
    };
  });

  const table = (
    <ChartTable
      head={['Mês', 'Lançado', 'Esperado', 'Cobertura']}
      rows={months.map((point) => [
        formatMonthLong(point.month),
        point.isLoaded ? formatTotalHours(point.seconds) : '…',
        point.isLoaded ? formatTotalHours(point.expectedSeconds) : '…',
        point.isLoaded ? formatPercent(point.coverage) : '…',
      ])}
    />
  );

  return (
    <ChartCard
      className={className}
      title={title}
      subtitle={subtitle}
      legend={[
        { label: formatMonthLong(selectedMonth), swatch: 'bar' },
        { label: 'Meses anteriores', swatch: 'muted-bar' },
        { label: 'Esperado', swatch: 'line' },
      ]}
      table={table}
    >
      <ColumnChart data={data} label={title} height={height} referenceStyle="tick" />
    </ChartCard>
  );
}
