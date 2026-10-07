import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type WorklogFillMode = 'duration' | 'end';

interface LogWorkSettingsState {
  closeOnSuccess: boolean;
  setCloseOnSuccess: (closeOnSuccess: boolean) => void;
  fillMode: WorklogFillMode;
  setFillMode: (fillMode: WorklogFillMode) => void;
}

export const useLogWorkSettingsStore = create<LogWorkSettingsState>()(
  persist(
    (set) => ({
      closeOnSuccess: false,
      setCloseOnSuccess: (closeOnSuccess) => set({ closeOnSuccess }),
      fillMode: 'duration',
      setFillMode: (fillMode) => set({ fillMode }),
    }),
    {
      name: 'team-report:log-work',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ closeOnSuccess: state.closeOnSuccess }),
    },
  ),
);
