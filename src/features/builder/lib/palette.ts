/**
 * Cores das séries ("Cruzar com"), na ordem fixa: a ordem é o que separa as
 * cores para quem tem daltonismo (validada com o validador da skill dataviz,
 * sobre o cartão de cada tema). Três delas têm menos de 3:1 de contraste com o
 * fundo claro: os gráficos sempre têm legenda e a visão em tabela. Mais séries
 * que cores viram "Outras". São as variáveis `--series-N` do global.css, com o
 * passo de cada tema.
 */
export const SERIES_COLORS = Array.from({ length: 8 }, (_, index) => `var(--series-${index + 1})`);

/**
 * Os mesmos 8 tons em hex (passos do tema claro), para o que precisa de uma
 * cor fixa: as faixas do mapa de calor, que a pessoa escolhe no seletor de cor
 * e ficam salvas no dashboard.
 */
export const SERIES_HEX = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

/** "Outras": cinza de contexto, nunca uma cor nova. */
export const OTHERS_COLOR = 'var(--text-faint)';

/** Uma série só: o azul do projeto (o mesmo dos gráficos do Metrics). */
export const SINGLE_COLOR = 'var(--blue)';

/**
 * Rampa sequencial (uma cor) do mapa de calor, do valor mais baixo ao mais
 * alto: do claro ao escuro no tema claro e o contrário no escuro, onde o valor
 * baixo some no fundo (variáveis `--heat-N` do global.css).
 */
export const HEAT_RAMP = Array.from({ length: 7 }, (_, index) => `var(--heat-${index + 1})`);

/** Passo da rampa de um valor (0 = vazio: sem cor). */
export function heatColor(value: number, max: number): string | undefined {
  if (!(value > 0) || !(max > 0)) return undefined;
  const step = Math.min(HEAT_RAMP.length - 1, Math.floor((value / max) * HEAT_RAMP.length));
  return HEAT_RAMP[step];
}

/** Texto sobre a célula: branco nos passos escuros, tinta nos claros (`--heat-ink-N`, de cada tema). */
export function heatInk(value: number, max: number): string {
  const step = Math.min(HEAT_RAMP.length - 1, Math.floor((value / max) * HEAT_RAMP.length));
  return `var(--heat-ink-${step + 1})`;
}
