import { browserTimeZone, utcOffsetMinutes } from './dates';

/** Fusos aceitos pelo relatório; o seletor e o valor salvo sempre usam um destes. */
export const FIXED_TIME_ZONES = [
  { value: 'America/Sao_Paulo', label: 'Sao Paulo' },
  { value: 'America/Cuiaba', label: 'Campo Grande' },
] as const;

export type ReportTimeZone = (typeof FIXED_TIME_ZONES)[number]['value'];

export function isReportTimeZone(value: unknown): value is ReportTimeZone {
  return FIXED_TIME_ZONES.some((zone) => zone.value === value);
}

export function reportTimeZoneLabel(timeZone: ReportTimeZone): string {
  return FIXED_TIME_ZONES.find((zone) => zone.value === timeZone)?.label ?? timeZone;
}

/**
 * Fuso inicial: o do navegador, se for um dos aceitos; senão, o aceito com o
 * mesmo deslocamento UTC agora (ex: Manaus → Campo Grande, Recife → Sao Paulo);
 * senão, o primeiro da lista.
 */
export function defaultReportTimeZone(browser: string = browserTimeZone(), at: Date = new Date()): ReportTimeZone {
  if (isReportTimeZone(browser)) return browser;
  const offset = utcOffsetMinutes(browser, at);
  const sameOffset = FIXED_TIME_ZONES.find((zone) => offset !== null && utcOffsetMinutes(zone.value, at) === offset);
  return (sameOffset ?? FIXED_TIME_ZONES[0]).value;
}
