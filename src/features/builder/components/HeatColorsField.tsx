import { Plus, Trash } from '@phosphor-icons/react';
import { useId, useState } from 'react';
import { FormField } from '../../../components/FormField';
import type { MeasureUnit } from '../lib/format';
import { defaultHeatRanges, formatThreshold, rangeLabel } from '../lib/heat';
import { HEAT_RAMP, SERIES_HEX } from '../lib/palette';
import type { HeatColors, HeatRange } from '../types';
import styles from './HeatColorsField.module.css';
import { Segmented } from './Segmented';

interface HeatColorsFieldProps {
  value: HeatColors | undefined;
  /** Unidade da medida do mapa: os limites são em horas (duração) ou na contagem. */
  unit: MeasureUnit;
  onChange: (value: HeatColors) => void;
}

/** Mais faixas que isto viram ruído na legenda. */
const MAX_RANGES = 8;

/** Limite de uma faixa: rascunho em texto, para dar para apagar e digitar outro número. */
function ThresholdInput({ value, unit, label, onChange }: { value: number; unit: MeasureUnit; label: string; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(String(value));
  }
  return (
    <span className={styles.threshold}>
      <input
        className="input"
        type="number"
        inputMode="decimal"
        min={0}
        step={unit === 'duration' ? 0.5 : 1}
        aria-label={label}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = Number(event.target.value.replace(',', '.'));
          if (event.target.value.trim() !== '' && Number.isFinite(next) && next >= 0) onChange(next);
        }}
        onBlur={() => setDraft(String(value))}
      />
      {unit === 'duration' && <span className={styles.unit}>h</span>}
    </span>
  );
}

/**
 * Cores do mapa de calor: monocromático (uma cor, do claro ao escuro, pelo maior
 * valor da grade) ou personalizado (faixas com limites e cores escolhidos).
 */
export function HeatColorsField({ value, unit, onChange }: HeatColorsFieldProps) {
  const groupId = useId();
  const mode = value?.mode ?? 'mono';
  // As faixas ficam guardadas mesmo voltando ao monocromático: dá para alternar sem perder a escolha.
  const ranges = value?.ranges.length ? value.ranges : defaultHeatRanges(unit);
  const limited = ranges.filter((range) => range.upTo !== null);
  const isAscending = limited.every((range, index) => index === 0 || range.upTo! > limited[index - 1].upTo!);

  function update(next: HeatRange[]) {
    onChange({ mode: 'custom', ranges: next });
  }

  function setRange(index: number, patch: Partial<HeatRange>) {
    update(ranges.map((range, current) => (current === index ? { ...range, ...patch } : range)));
  }

  function addRange() {
    // Antes da última (a sem limite), um passo acima do maior limite, numa cor ainda não usada.
    const lastLimit = limited.length ? Math.max(...limited.map((range) => range.upTo!)) : 0;
    const used = new Set(ranges.map((range) => range.color.toLowerCase()));
    const color = SERIES_HEX.find((candidate) => !used.has(candidate)) ?? SERIES_HEX[0];
    const open = ranges.filter((range) => range.upTo === null);
    update([...limited, { upTo: lastLimit + (unit === 'duration' ? 2 : 1), color }, ...open]);
  }

  return (
    <FormField label="Cores" htmlFor={groupId}>
      <Segmented
        label="Cores do mapa de calor"
        value={mode}
        options={[
          { value: 'mono', label: 'Monocromático' },
          { value: 'custom', label: 'Personalizado' },
        ]}
        onChange={(next) => onChange({ mode: next, ranges })}
      />

      {mode === 'mono' ? (
        <div className={styles.mono} id={groupId}>
          <span className={styles.ramp} aria-hidden>
            {HEAT_RAMP.map((color) => (
              <span key={color} style={{ background: color }} />
            ))}
          </span>
          <p className={styles.hint}>Uma cor só: quanto maior o valor, mais forte a cor da célula (pelo maior valor da grade).</p>
        </div>
      ) : (
        <div className={styles.custom} id={groupId}>
          <ol className={styles.ranges}>
            {ranges.map((range, index) => {
              const name = rangeLabel(ranges, index, unit);
              const previous = ranges
                .slice(0, index)
                .reverse()
                .find((item) => item.upTo !== null)?.upTo ?? undefined;
              return (
                <li key={index} className={styles.range}>
                  <input
                    type="color"
                    className={styles.color}
                    value={range.color}
                    aria-label={`Cor da faixa ${name}`}
                    onChange={(event) => setRange(index, { color: event.target.value })}
                  />
                  {range.upTo === null ? (
                    <span className={styles.openLabel}>
                      {previous === undefined || previous === null ? 'Todos os valores' : `Acima de ${formatThreshold(previous, unit)}`}
                    </span>
                  ) : (
                    <span className={styles.limit}>
                      <span className={styles.until}>Até</span>
                      <ThresholdInput
                        value={range.upTo}
                        unit={unit}
                        label={`Limite da faixa ${index + 1}`}
                        onChange={(upTo) => setRange(index, { upTo })}
                      />
                    </span>
                  )}
                  {range.upTo !== null && limited.length > 1 && (
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={`Remover a faixa ${name}`}
                      title="Remover a faixa"
                      onClick={() => update(ranges.filter((_, current) => current !== index))}
                    >
                      <Trash size={14} weight="bold" aria-hidden />
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {!isAscending && (
            <p className={styles.warning} role="status">
              Os limites precisam crescer de cima para baixo: o mapa usa as faixas na ordem dos limites.
            </p>
          )}
          {ranges.length < MAX_RANGES && (
            <button type="button" className={styles.add} onClick={addRange}>
              <Plus size={13} weight="bold" aria-hidden /> Adicionar faixa
            </button>
          )}
          <p className={styles.hint}>
            Os limites são em {unit === 'duration' ? 'horas' : 'unidades da medida'}. Células sem nada ficam em cinza.
          </p>
        </div>
      )}
    </FormField>
  );
}
