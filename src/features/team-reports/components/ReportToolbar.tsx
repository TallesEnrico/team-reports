import { LabeledSelect, type SelectOption } from '../../../components/LabeledSelect';
import type { TimeFormat } from '../../../lib/formatDuration';
import { FIXED_TIME_ZONES } from '../../../lib/timeZones';
import type { GroupBy, PeriodGrouping, ReportDisplay } from '../types';
import styles from './ReportToolbar.module.css';

interface ReportToolbarProps {
  display: ReportDisplay;
  onChange: (patch: Partial<ReportDisplay>) => void;
}

const GROUP_BY_OPTIONS: SelectOption<GroupBy>[] = [
  { value: 'issue', label: 'Tarefa' },
  { value: 'parent', label: 'Tarefa pai' },
  { value: 'user', label: 'Pessoa' },
  { value: 'project', label: 'Projeto' },
];

const PERIOD_OPTIONS: SelectOption<PeriodGrouping>[] = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
];

const TIME_FORMAT_OPTIONS: SelectOption<TimeFormat>[] = [
  { value: 'hours-minutes', label: 'Horas & Minutos' },
  { value: 'decimal', label: 'Horas Decimais' },
  { value: 'clock', label: 'Relógio (hh:mm)' },
];

export function ReportToolbar({ display, onChange }: ReportToolbarProps) {
  return (
    <div className={styles.toolbar} role="group" aria-label="Configuração do relatório">
      <LabeledSelect
        layout="inline"
        label="Agrupar por"
        value={display.groupBy}
        options={GROUP_BY_OPTIONS}
        onChange={(groupBy) => onChange({ groupBy })}
      />
      <LabeledSelect
        layout="inline"
        label="Período"
        value={display.period}
        options={PERIOD_OPTIONS}
        onChange={(period) => onChange({ period })}
      />
      <LabeledSelect
        layout="inline"
        label="Formato"
        value={display.timeFormat}
        options={TIME_FORMAT_OPTIONS}
        onChange={(timeFormat) => onChange({ timeFormat })}
      />
      <LabeledSelect
        layout="inline"
        label="Fuso"
        value={display.timeZone}
        options={[...FIXED_TIME_ZONES]}
        onChange={(timeZone) => onChange({ timeZone })}
      />
    </div>
  );
}
