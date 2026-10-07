export type TimeFormat = 'hours-minutes' | 'decimal' | 'clock';

const decimalFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formata uma duração em segundos. Zero vira string vazia (célula sem apontamento). */
export function formatDuration(seconds: number, format: TimeFormat): string {
  if (!seconds) return '';

  if (format === 'decimal') return decimalFormatter.format(seconds / 3600);

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const paddedMinutes = String(minutes).padStart(2, '0');
  if (format === 'clock') return `${hours}:${paddedMinutes}`;
  // Sempre horas e minutos (0h 49m, 3h 00m): os valores ficam alinhados nas colunas.
  return `${hours}h ${paddedMinutes}m`;
}
