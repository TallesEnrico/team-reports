import { CalendarBlank, CaretDown, Check } from '@phosphor-icons/react';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../../components/Button';
import { todayKey } from '../../../lib/dates';
import { BUILDER_TIME_ZONE } from '../hooks/useBuilderResults';
import { plural } from '../lib/format';
import { PERIOD_OPTIONS, periodLabel, rangeLabel, resolvePeriod } from '../lib/periods';
import type { PeriodConfig } from '../types';
import styles from './DashboardPeriodPicker.module.css';

interface DashboardPeriodPickerProps {
  value: PeriodConfig;
  onChange: (period: PeriodConfig) => void;
  /** Peças de dados com período próprio: não mudam com este seletor. */
  ownPeriodPieces: number;
}

/**
 * Período do dashboard, ao lado de "Montar | Dashboard": vale para todas as
 * peças de dados que seguem o dashboard. Atalhos (este mês, últimos 30 dias…)
 * ou "De… até…" no rodapé.
 */
export function DashboardPeriodPicker({ value, onChange, ownPeriodPieces }: DashboardPeriodPickerProps) {
  const panelId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const today = todayKey(BUILDER_TIME_ZONE);
  const range = resolvePeriod(value, today);

  // "De… até…": começa com as datas que estão valendo.
  const [from, setFrom] = useState(range?.from ?? '');
  const [to, setTo] = useState(range?.to ?? '');
  const custom: PeriodConfig = { preset: 'custom', from: from || null, to: to || null };
  const customRange = resolvePeriod(custom, today);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  function open() {
    if (range) {
      setFrom(range.from);
      setTo(range.to);
    }
    setIsOpen(true);
  }

  function choose(period: PeriodConfig) {
    onChange(period);
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  }

  return (
    <div ref={containerRef} className={styles.picker} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        title="Período analisado pelo dashboard"
        onClick={() => (isOpen ? setIsOpen(false) : open())}
      >
        <CalendarBlank size={15} weight="bold" aria-hidden />
        <span className={styles.label}>{value.preset === 'custom' ? 'Período' : periodLabel(value)}</span>
        {range && <span className={styles.range}>{rangeLabel(range)}</span>}
        <CaretDown size={12} weight="bold" className={styles.caret} aria-hidden />
      </button>

      {isOpen && (
        <div id={panelId} className={styles.panel} role="dialog" aria-label="Período do dashboard">
          <p className={styles.heading}>Período do dashboard</p>
          <ul className={styles.options}>
            {PERIOD_OPTIONS.filter((option) => option.value !== 'custom').map((option) => {
              const optionRange = resolvePeriod({ preset: option.value, from: null, to: null }, today);
              const isSelected = value.preset === option.value;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    className={styles.option}
                    aria-pressed={isSelected}
                    onClick={() => choose({ preset: option.value, from: null, to: null })}
                  >
                    <span className={styles.check} aria-hidden>
                      {isSelected && <Check size={16} weight="bold" />}
                    </span>
                    <span className={styles.optionLabel}>{option.label}</span>
                    {optionRange && <span className={styles.optionRange}>{rangeLabel(optionRange)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>

          <form
            className={styles.custom}
            onSubmit={(event) => {
              event.preventDefault();
              if (customRange) choose(custom);
            }}
          >
            <p className={styles.customHeading}>
              <span className={styles.check} aria-hidden>
                {value.preset === 'custom' && <Check size={16} weight="bold" />}
              </span>
              De… até…
            </p>
            <div className={styles.dates}>
              <input
                type="date"
                className="input"
                aria-label="De"
                value={from}
                max={to || undefined}
                onChange={(event) => setFrom(event.target.value)}
              />
              <span aria-hidden>até</span>
              <input
                type="date"
                className="input"
                aria-label="Até"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
            <Button type="submit" variant="primary" className={styles.apply} disabled={!customRange}>
              Aplicar
            </Button>
          </form>

          {ownPeriodPieces > 0 && (
            <p className={styles.note}>
              {plural(ownPeriodPieces, 'peça tem', 'peças têm')} período próprio e não {ownPeriodPieces === 1 ? 'muda' : 'mudam'}{' '}
              com este seletor.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
