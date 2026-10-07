/** Passo "redondo" (1, 2 ou 5 × 10ⁿ) mais próximo acima do passo bruto. */
function niceStep(rawStep: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

/** Topo do eixo e marcas redondas (0, 20, 40…) para valores até `max`, com cerca de `tickCount` intervalos. */
export function niceScale(max: number, tickCount = 4): { max: number; ticks: number[] } {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] };
  const step = niceStep(max / tickCount);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let tick = 0; tick <= top + step / 2; tick += step) ticks.push(tick);
  return { max: top, ticks };
}
