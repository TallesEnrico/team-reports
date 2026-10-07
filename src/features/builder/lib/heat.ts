import type { HeatColors, HeatRange } from '../types';
import type { MeasureUnit } from './format';
import { heatColor, heatInk, HEAT_RAMP } from './palette';

const thresholdFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** Faixas iniciais do modo personalizado: horas de um dia (até 4h, até 8h, mais) ou contagens. */
export function defaultHeatRanges(unit: MeasureUnit): HeatRange[] {
  return unit === 'duration'
    ? [
        { upTo: 4, color: '#e34948' },
        { upTo: 8, color: '#1baf7a' },
        { upTo: null, color: '#2a78d6' },
      ]
    : [
        { upTo: 2, color: '#e34948' },
        { upTo: 5, color: '#eda100' },
        { upTo: null, color: '#1baf7a' },
      ];
}

/** "4h", "4,5h" (duração) ou "12" (contagem). */
export function formatThreshold(value: number, unit: MeasureUnit): string {
  const number = thresholdFormatter.format(value);
  return unit === 'duration' ? `${number}h` : number;
}

/** As faixas na ordem dos limites, com a última (sem limite) no fim. */
export function sortedRanges(ranges: HeatRange[]): HeatRange[] {
  const limited = ranges.filter((range) => range.upTo !== null).sort((a, b) => a.upTo! - b.upTo!);
  const open = ranges.find((range) => range.upTo === null);
  return open ? [...limited, open] : limited;
}

/** Rótulo de cada faixa, para a legenda: "até 4h", "4h a 8h", "acima de 8h". */
export function rangeLabel(ranges: HeatRange[], index: number, unit: MeasureUnit): string {
  const range = ranges[index];
  const previous = index > 0 ? ranges[index - 1].upTo : null;
  if (range.upTo === null) return previous === null ? 'todos os valores' : `acima de ${formatThreshold(previous, unit)}`;
  if (previous === null) return `até ${formatThreshold(range.upTo, unit)}`;
  return `${formatThreshold(previous, unit)} a ${formatThreshold(range.upTo, unit)}`;
}

/** Luminância relativa de uma cor `#rrggbb` (0 = preto, 1 = branco). */
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/**
 * Texto sobre uma cor qualquer: branco nas escuras, tinta nas claras. A cor da
 * faixa é fixa (não muda com o tema), então o texto também: `--text-strong`
 * ficaria claro sobre uma faixa clara no tema escuro.
 */
export function inkOn(hex: string): string {
  return luminance(hex) > 0.4 ? '#111111' : '#ffffff';
}

/** Como pintar as células: a cor de cada valor, o texto sobre ela e a legenda. */
export interface HeatPainter {
  /** Cor da célula (`undefined`: vazia, sem nada). */
  color: (value: number) => string | undefined;
  ink: (value: number) => string;
  legend: { color: string; label: string }[] | null;
}

/**
 * Pintura do mapa de calor. Monocromático: a rampa azul, relativa ao maior
 * valor da grade. Personalizado: a faixa em que o valor cai, pelos limites
 * escolhidos (em horas ou na contagem). Zero fica sempre vazio.
 */
export function heatPainter(colors: HeatColors | undefined, unit: MeasureUnit, max: number): HeatPainter {
  if (colors?.mode !== 'custom' || colors.ranges.length === 0) {
    return { color: (value) => heatColor(value, max), ink: (value) => heatInk(value, max), legend: null };
  }
  const ranges = sortedRanges(colors.ranges);
  const inUnit = (value: number) => (unit === 'duration' ? value / 3600 : value);
  const rangeOf = (value: number) =>
    ranges.find((range) => range.upTo === null || inUnit(value) <= range.upTo) ?? ranges[ranges.length - 1];
  return {
    color: (value) => (value > 0 ? rangeOf(value).color : undefined),
    ink: (value) => inkOn(rangeOf(value).color),
    legend: ranges.map((range, index) => ({ color: range.color, label: rangeLabel(ranges, index, unit) })),
  };
}

export { HEAT_RAMP };
