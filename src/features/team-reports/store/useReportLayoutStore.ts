import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface ReportLayoutState {
  /** Largura da coluna de descrição (Issue + resumo), em px; `null` = padrão do CSS. */
  rowHeaderWidth: number | null;
  setRowHeaderWidth: (width: number | null) => void;
}

/** Preferências de layout da tabela, lembradas entre visitas. */
export const useReportLayoutStore = create<ReportLayoutState>()(
  persist(
    (set) => ({
      rowHeaderWidth: null,
      setRowHeaderWidth: (rowHeaderWidth) => set({ rowHeaderWidth }),
    }),
    {
      name: 'team-report:layout',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ rowHeaderWidth: state.rowHeaderWidth }),
    },
  ),
);
