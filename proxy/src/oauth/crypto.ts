const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

export function randomUrlSafe(size = 32): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function hmacKey(secret: string, purpose: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', encoder.encode(`${purpose}:${secret}`));
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', encoder.encode(`team-oauth-seal:${secret}`));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function signPayload(secret: string, purpose: string, value: unknown): Promise<string> {
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify(value)));
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(secret, purpose), encoder.encode(payload));
  return `${payload}.${bytesToBase64Url(new Uint8Array(mac))}`;
}

export async function readPayload<T>(
  secret: string,
  purpose: string,
  token: string,
  parse: (value: unknown) => T | null,
): Promise<T | null> {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const signature = base64UrlToBytes(mac);
  const body = base64UrlToBytes(payload);
  if (!signature || !body) return null;
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret, purpose), signature, encoder.encode(payload));
  if (!valid) return null;
  try {
    return parse(JSON.parse(decoder.decode(body)));
  } catch {
    return null;
  }
}

export async function sealJson(secret: string, value: unknown, associatedData: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(associatedData) },
      await aesKey(secret),
      encoder.encode(JSON.stringify(value)),
    ),
  );
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv, 0);
  packed.set(cipher, iv.length);
  return bytesToBase64Url(packed);
}

export async function openJson<T>(
  secret: string,
  sealed: string,
  associatedData: string,
  parse: (value: unknown) => T | null,
): Promise<T | null> {
  const packed = base64UrlToBytes(sealed);
  if (!packed || packed.length < 13) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: packed.slice(0, 12),
        additionalData: encoder.encode(associatedData),
      },
      await aesKey(secret),
      packed.slice(12),
    );
    return parse(JSON.parse(decoder.decode(plain)));
  } catch {
    return null;
  }
}

export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  return bytesToBase64Url(new Uint8Array(digest));
}
