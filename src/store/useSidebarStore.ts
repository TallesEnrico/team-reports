import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Larguras da lateral, em px. Mantenha `default` em sincronia com `--sidebar-width` em AppShell.module.css. */
export const SIDEBAR_WIDTH = { default: 320, min: 240, max: 560 } as const;

interface SidebarState {
  /** Largura escolhida arrastando a borda; `null` = padrão. */
  width: number | null;
  /** Lateral escondida para dar espaço à área principal. */
  collapsed: boolean;
  setWidth: (width: number | null) => void;
  setCollapsed: (collapsed: boolean) => void;
}

/**
 * Preferências da lateral, iguais em todas as telas e lembradas entre visitas.
 * No localStorage (síncrono): a lateral já abre com a largura salva, sem pular.
 */
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      width: null,
      collapsed: false,
      setWidth: (width) => set({ width }),
      setCollapsed: (collapsed) => set({ collapsed }),
    }),
    {
      name: 'team-report:sidebar',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ width: state.width, collapsed: state.collapsed }),
    },
  ),
);
