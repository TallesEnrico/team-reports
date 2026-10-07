import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Tema escolhido: claro, escuro ou o do sistema operacional. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** Tema que vale na tela, com o do sistema já resolvido. */
export type Theme = 'light' | 'dark';

/** Chave no localStorage. O script do `index.html` lê a mesma chave, antes do primeiro quadro. */
export const THEME_STORAGE_KEY = 'team-report:theme';

interface ThemeState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

/**
 * Tema do app, igual em todas as telas e lembrado entre visitas. No
 * localStorage (síncrono), para o `index.html` aplicar o tema antes de o
 * React montar, sem piscar o claro.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: 'light',
      setPreference: (preference) => set({ preference }),
    }),
    {
      name: THEME_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ preference: state.preference }),
    },
  ),
);
