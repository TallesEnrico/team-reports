import { OTHERS_KEY } from './datasets';
import { OTHERS_COLOR, SERIES_COLORS } from './palette';
import type { DimValue } from '../types';

/** Cor de uma série pela posição dela (as séries vêm da maior para a menor); "Outras" em cinza. */
export function seriesColor(series: DimValue, index: number): string {
  return series.key === OTHERS_KEY ? OTHERS_COLOR : SERIES_COLORS[index % SERIES_COLORS.length];
}
