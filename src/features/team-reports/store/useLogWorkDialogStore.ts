import { create } from 'zustand';
import type { DateKey } from '@/lib/dates';

export interface LogWorkIssueSeed {
  id?: string;
  key: string;
  summary: string;
  status?: { name: string; categoryKey?: string };
  issueType?: { name: string; iconUrl?: string };
  parent?: { id: string; key: string; summary: string; iconUrl?: string };
}

export interface LogWorkDialogSession {
  issue?: LogWorkIssueSeed;
  date?: DateKey;
  start?: string;
  end?: string;
  comment?: string;
}

interface LogWorkDialogState {
  session: (LogWorkDialogSession & { id: number }) | null;
  open: (session?: LogWorkDialogSession) => void;
  close: () => void;
}

let nextId = 0;

export const useLogWorkDialogStore = create<LogWorkDialogState>((set) => ({
  session: null,
  open: (session = {}) => set({ session: { ...session, id: ++nextId } }),
  close: () => set({ session: null }),
}));
