import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import type { PersistStorage, StorageValue } from 'zustand/middleware';

let store: UseStore | null | undefined;

function getStore(): UseStore | null {
  if (store === undefined) {
    // Criado sob demanda: sem IndexedDB (ex: contextos restritos) o app segue sem persistir.
    store = typeof indexedDB === 'undefined' ? null : createStore('team-report', 'state');
  }
  return store;
}

/**
 * Storage do `persist` do Zustand gravando no IndexedDB. Os objetos são salvos
 * como estão (structured clone), sem JSON. Falhas de leitura/escrita (modo
 * privado, cota cheia) viram "sem dados salvos" para a tela nunca quebrar por isso.
 */
export function createIndexedDbStorage<State>(): PersistStorage<State, Promise<void>> {
  return {
    getItem: async (name) => {
      const idbStore = getStore();
      if (!idbStore) return null;
      try {
        return (await get<StorageValue<State>>(name, idbStore)) ?? null;
      } catch {
        return null;
      }
    },
    setItem: async (name, value) => {
      const idbStore = getStore();
      if (!idbStore) return;
      try {
        await set(name, value, idbStore);
      } catch {
        // Sem persistência nesta sessão; o estado em memória continua valendo.
      }
    },
    removeItem: async (name) => {
      const idbStore = getStore();
      if (!idbStore) return;
      try {
        await del(name, idbStore);
      } catch {
        // Idem.
      }
    },
  };
}
