import { create } from 'zustand';
import { DEFAULT_AI_MODEL } from '../api/openrouter';
import { deleteEncrypted, loadEncrypted, saveEncrypted } from '../lib/encryptedStorage';

interface OpenRouterSettings {
  /** Chave da OpenRouter da pessoa (sk-or-…). */
  apiKey: string;
  /** Modelo escolhido (id da OpenRouter, ou `auto`). */
  model: string;
}

type OpenRouterStatus = 'loading' | 'disconnected' | 'connected';

interface OpenRouterState {
  status: OpenRouterStatus;
  apiKey: string | null;
  model: string;
  /** Lê e decifra a chave salva; só a primeira chamada faz isso. */
  load: () => Promise<void>;
  /** Cifra e salva a chave (já conferida na OpenRouter). */
  connect: (apiKey: string) => Promise<void>;
  setModel: (model: string) => Promise<void>;
  /** Apaga a chave deste navegador. */
  disconnect: () => Promise<void>;
}

const RECORD_ID = 'openrouter-connection';

function isSettings(value: unknown): value is OpenRouterSettings {
  const record = value as Partial<OpenRouterSettings> | null;
  return typeof record?.apiKey === 'string' && typeof record.model === 'string';
}

let loading: Promise<void> | null = null;

/**
 * Chave da OpenRouter, para a IA do Dashboard. Como o token do Jira, fica
 * cifrada no IndexedDB (lib/encryptedStorage) e decifrada só em memória.
 */
export const useOpenRouterStore = create<OpenRouterState>()((set, get) => ({
  status: 'loading',
  apiKey: null,
  model: DEFAULT_AI_MODEL,
  load: () =>
    (loading ??= (async () => {
      const saved = await loadEncrypted<unknown>(RECORD_ID);
      set(
        isSettings(saved)
          ? { status: 'connected', apiKey: saved.apiKey, model: saved.model || DEFAULT_AI_MODEL }
          : { status: 'disconnected', apiKey: null },
      );
    })()),
  connect: async (apiKey) => {
    const { model } = get();
    await saveEncrypted(RECORD_ID, { apiKey, model } satisfies OpenRouterSettings);
    set({ status: 'connected', apiKey });
  },
  setModel: async (model) => {
    const { apiKey } = get();
    set({ model });
    if (apiKey) await saveEncrypted(RECORD_ID, { apiKey, model } satisfies OpenRouterSettings);
  },
  disconnect: async () => {
    await deleteEncrypted(RECORD_ID);
    set({ status: 'disconnected', apiKey: null, model: DEFAULT_AI_MODEL });
  },
}));
