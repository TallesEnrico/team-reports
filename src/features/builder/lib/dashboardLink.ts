import type { Dashboard } from '../types';
import { MAX_IMPORT_BYTES, serializeDashboard } from './transfer';

/**
 * Parâmetro do link compartilhado: `/dashboard?dashboard=…`. O dashboard vai
 * de um navegador ao outro só dentro do link.
 */
export const SHARED_DASHBOARD_PARAM = 'dashboard';

/** Acima disso o link fica longo demais para mensageiros e e-mails; aí vai o arquivo. */
export const MAX_LINK_LENGTH = 32_000;

/** Prefixo do conteúdo: comprimido (deflate) ou, sem `CompressionStream`, o .json como está. */
const COMPRESSED = 'z';
const PLAIN = 'j';

const canCompress = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  // Em pedaços: `String.fromCharCode(...bytes)` estoura a pilha com arrays grandes.
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Lê o fluxo até `max` bytes: um link pode ser montado para descomprimir sem fim. */
async function readUpTo(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * O link do dashboard: o endereço do Dashboard com a montagem (o .json do
 * "Exportar", comprimido) no parâmetro `dashboard`. Quem abre confirma antes de importar.
 */
export async function dashboardLink(dashboard: Dashboard, appUrl: string): Promise<string> {
  const json = new TextEncoder().encode(serializeDashboard(dashboard, { compact: true }));
  let payload = PLAIN + toBase64Url(json);
  if (canCompress) {
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    payload = COMPRESSED + toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
  }
  return `${new URL(appUrl).origin}/dashboard?${new URLSearchParams({ [SHARED_DASHBOARD_PARAM]: payload })}`;
}

/** O .json de um link; `null` se o link está quebrado, cortado ou é grande demais. */
export async function readDashboardLink(payload: string): Promise<string | null> {
  // Nenhum link que o app monta passa disso; um maior só pode ter sido montado à mão.
  if (payload.length > MAX_LINK_LENGTH) return null;
  try {
    const bytes = fromBase64Url(payload.slice(1));
    if (payload.startsWith(PLAIN)) return bytes.byteLength > MAX_IMPORT_BYTES ? null : new TextDecoder().decode(bytes);
    if (!payload.startsWith(COMPRESSED) || !canCompress) return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const json = await readUpTo(stream, MAX_IMPORT_BYTES);
    return json && new TextDecoder().decode(json);
  } catch {
    return null;
  }
}
