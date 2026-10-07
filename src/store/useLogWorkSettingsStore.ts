import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface LogWorkSettingsState {
  closeOnSuccess: boolean;
  setCloseOnSuccess: (closeOnSuccess: boolean) => void;
}

export const useLogWorkSettingsStore = create<LogWorkSettingsState>()(
  persist(
    (set) => ({
      closeOnSuccess: false,
      setCloseOnSuccess: (closeOnSuccess) => set({ closeOnSuccess }),
    }),
    {
      name: 'team-report:log-work',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ closeOnSuccess: state.closeOnSuccess }),
    },
  ),
);
