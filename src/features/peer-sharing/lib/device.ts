const DEVICE_KEY = 'team-report:device-id';

export const DEVICE_ID = /^[A-Za-z0-9-]{8,64}$/;

let sessionDeviceId: string | null = null;

/**
 * Identifica este navegador entre as conexões: as abas dele são um dispositivo
 * só. Fica no localStorage; sem ele (modo privado restrito), vale só nesta aba.
 */
export function getDeviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved && DEVICE_ID.test(saved)) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    sessionDeviceId ??= crypto.randomUUID();
    return sessionDeviceId;
  }
}

function browserOf(userAgent: string): string {
  if (/Edg(e|A|iOS)?\//.test(userAgent)) return 'Edge';
  if (/OPR\/|Opera/.test(userAgent)) return 'Opera';
  if (/Firefox\/|FxiOS\//.test(userAgent)) return 'Firefox';
  if (/Chrome\/|CriOS\//.test(userAgent)) return 'Chrome';
  if (/Safari\//.test(userAgent)) return 'Safari';
  return 'Navegador';
}

function systemOf(userAgent: string): string | null {
  if (/Windows/.test(userAgent)) return 'Windows';
  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/iPad/.test(userAgent)) return 'iPad';
  if (/Android/.test(userAgent)) return 'Android';
  if (/CrOS/.test(userAgent)) return 'ChromeOS';
  if (/Mac OS X|Macintosh/.test(userAgent)) return 'macOS';
  if (/Linux/.test(userAgent)) return 'Linux';
  return null;
}

/** "Chrome no macOS": o navegador e o sistema do dispositivo. */
export function describeDevice(userAgent: string): string {
  const system = systemOf(userAgent);
  const browser = browserOf(userAgent);
  return system ? `${browser} no ${system}` : browser;
}

/**
 * "tallessoares - Chrome no macOS": o nome do dispositivo quando a pessoa não
 * escolheu outro, com a primeira parte do e-mail (cortada em 32 caracteres, para caber).
 */
export function defaultDeviceName(email: string, userAgent: string): string {
  const localPart = email.trim().toLowerCase().split('@')[0].slice(0, 32);
  return localPart ? `${localPart} - ${describeDevice(userAgent)}` : describeDevice(userAgent);
}
