import { addDays, type DateKey, isWeekend, toDateKey } from './dates';

// Feriados nacionais do Brasil e os pontos facultativos que costumam parar o
// trabalho (Carnaval, Corpus Christi). Feriados estaduais e municipais variam
// por cidade e ficam de fora.

const FIXED_HOLIDAYS: Record<string, string> = {
  '01-01': 'Confraternização Universal',
  '04-21': 'Tiradentes',
  '05-01': 'Dia do Trabalho',
  '09-07': 'Independência do Brasil',
  '10-12': 'Nossa Senhora Aparecida',
  '11-02': 'Finados',
  '11-15': 'Proclamação da República',
  '11-20': 'Dia Nacional de Zumbi e da Consciência Negra',
  '12-25': 'Natal',
};

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
function easterSunday(year: number): DateKey {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toDateKey(new Date(Date.UTC(year, month - 1, day)));
}

const holidaysByYear = new Map<number, Map<DateKey, string>>();

/** Feriados (e pontos facultativos) do ano, pela data. */
export function holidaysOf(year: number): Map<DateKey, string> {
  let holidays = holidaysByYear.get(year);
  if (holidays) return holidays;

  holidays = new Map(Object.entries(FIXED_HOLIDAYS).map(([monthDay, name]) => [`${year}-${monthDay}`, name]));
  const easter = easterSunday(year);
  holidays.set(addDays(easter, -48), 'Carnaval');
  holidays.set(addDays(easter, -47), 'Carnaval');
  holidays.set(addDays(easter, -2), 'Sexta-feira Santa');
  holidays.set(addDays(easter, 60), 'Corpus Christi');
  holidaysByYear.set(year, holidays);
  return holidays;
}

/** Nome do feriado na data, se houver. */
export function holidayOn(date: DateKey): string | undefined {
  return holidaysOf(Number(date.slice(0, 4))).get(date);
}

/** Dia útil: segunda a sexta, fora dos feriados nacionais e dos pontos facultativos de `holidaysOf`. */
export function isWorkday(date: DateKey): boolean {
  return !isWeekend(date) && !holidayOn(date);
}

/** Último dia útil antes da data (ex: na segunda, a sexta anterior; no dia 1º, o fim do mês anterior). */
export function previousWorkday(date: DateKey): DateKey {
  let day = addDays(date, -1);
  while (!isWorkday(day)) day = addDays(day, -1);
  return day;
}
