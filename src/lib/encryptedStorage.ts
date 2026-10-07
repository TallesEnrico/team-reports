import { createStore, del, get, set, type UseStore } from 'idb-keyval';

// Banco separado do estado da tela: idb-keyval usa um object store por banco.
const KEY_RECORD = 'aes-gcm-key';
let store: UseStore | undefined;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface EncryptedRecord {
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}

function getStore(): UseStore {
  return (store ??= createStore('team-report-secure', 'keyval'));
}

function isCryptoAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && Boolean(globalThis.crypto?.subtle);
}

async function getKey(createIfMissing: boolean): Promise<CryptoKey | null> {
  const existing = await get<CryptoKey>(KEY_RECORD, getStore());
  if (existing || !createIfMissing) return existing ?? null;

  // Não extraível: o código da página consegue usar a chave para cifrar/decifrar,
  // mas nem ele nem o DevTools conseguem exportar os bytes dela.
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await set(KEY_RECORD, key, getStore());
  return key;
}

/**
 * Cifra `value` (AES-GCM 256, IV aleatório por gravação) e grava no IndexedDB.
 * O `id` entra como dado autenticado: um registro copiado para outro id não decifra.
 */
export async function saveEncrypted(id: string, value: unknown): Promise<void> {
  if (!isCryptoAvailable()) {
    throw new Error('Este navegador não liberou criptografia para a página. Abra o app por https ou localhost.');
  }
  const key = (await getKey(true))!;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(id) },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  await set(id, { iv, data } satisfies EncryptedRecord, getStore());
}

/** Lê e decifra; `null` se não houver registro ou se ele não puder ser decifrado. */
export async function loadEncrypted<T>(id: string): Promise<T | null> {
  if (!isCryptoAvailable()) return null;
  try {
    const [record, key] = await Promise.all([get<EncryptedRecord>(id, getStore()), getKey(false)]);
    if (!record || !key) return null;
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: record.iv, additionalData: encoder.encode(id) },
      key,
      record.data,
    );
    return JSON.parse(decoder.decode(plain)) as T;
  } catch {
    return null;
  }
}

export async function deleteEncrypted(id: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await del(id, getStore());
  } catch {
    // Nada a remover.
  }
}
