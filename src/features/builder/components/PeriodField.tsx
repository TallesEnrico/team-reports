import { useId } from 'react';
import { FormField } from '../../../components/FormField';
import { todayKey } from '../../../lib/dates';
import { reportTimeZoneLabel } from '../../../lib/timeZones';
import { BUILDER_TIME_ZONE } from '../hooks/useBuilderResults';
import { PERIOD_OPTIONS, periodLabel, rangeLabel, resolvePeriod } from '../lib/periods';
import type { PeriodConfig, PeriodPreset } from '../types';
import { useBuilderContext } from './BuilderContext';
import styles from './InspectorFields.module.css';

interface PeriodFieldProps {
  label?: string;
  value: PeriodConfig;
  onChange: (value: PeriodConfig) => void;
}

/**
 * Período de uma peça de dados: o do dashboard (o seletor do cabeçalho, o
 * padrão) ou um próprio, por atalho (este mês, últimos 30 dias…) ou "De… até…".
 */
export function PeriodField({ label = 'Período', value, onChange }: PeriodFieldProps) {
  const id = useId();
  const { dashboardPeriod } = useBuilderContext();
  const range = resolvePeriod(value, todayKey(BUILDER_TIME_ZONE), dashboardPeriod);

  function choosePreset(preset: PeriodPreset) {
    // "De… até…" começa com as datas que estavam valendo.
    if (preset === 'custom' && range) onChange({ preset, from: range.from, to: range.to });
    else onChange({ ...value, preset });
  }

  let hint = 'Escolha as duas datas.';
  if (range) {
    const dates = `${rangeLabel(range)}, no fuso de ${reportTimeZoneLabel(BUILDER_TIME_ZONE)}.`;
    hint = value.preset === 'dashboard' ? `${dates} Muda junto com o período no alto da tela.` : dates;
  }

  return (
    <FormField label={label} htmlFor={id} hint={hint}>
      <select id={id} className="input" value={value.preset} onChange={(event) => choosePreset(event.target.value as PeriodPreset)}>
        <option value="dashboard">O do dashboard ({periodLabel(dashboardPeriod).toLowerCase()})</option>
        <optgroup label="Período próprio desta peça">
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      </select>
      {value.preset === 'custom' && (
        <div className={styles.dates}>
          <input
            type="date"
            className="input"
            aria-label="De"
            value={value.from ?? ''}
            max={value.to ?? undefined}
            onChange={(event) => onChange({ ...value, from: event.target.value || null })}
          />
          <span aria-hidden>até</span>
          <input
            type="date"
            className="input"
            aria-label="Até"
            value={value.to ?? ''}
            min={value.from ?? undefined}
            onChange={(event) => onChange({ ...value, to: event.target.value || null })}
          />
        </div>
      )}
    </FormField>
  );
}
