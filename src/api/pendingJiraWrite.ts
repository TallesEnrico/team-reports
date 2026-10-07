const STORAGE_KEY = 'team-report.pending-jira-write';
const MAX_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_WRITES = 6;
const BURST_MS = 2_000;

export interface PendingJiraWrite {
  method: 'POST' | 'PUT';
  path: string;
  data?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  savedAt: number;
}

interface WriteCopy {
  saved: string;
  done: string;
}

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function isWrite(value: unknown): value is PendingJiraWrite {
  if (!value || typeof value !== 'object') return false;
  const write = value as Partial<PendingJiraWrite>;
  return (
    (write.method === 'POST' || write.method === 'PUT') &&
    typeof write.path === 'string' &&
    write.path.length > 0 &&
    typeof write.savedAt === 'number'
  );
}

function readStored(): PendingJiraWrite[] {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const freshAfter = Date.now() - MAX_AGE_MS;
    return parsed.filter((item) => isWrite(item) && item.savedAt >= freshAfter);
  } catch {
    return [];
  }
}

function writeStored(writes: PendingJiraWrite[]): void {
  const bin = storage();
  if (!bin) return;
  if (writes.length === 0) {
    bin.removeItem(STORAGE_KEY);
    return;
  }
  bin.setItem(STORAGE_KEY, JSON.stringify(writes));
}

export function rememberPendingJiraWrite(write: Omit<PendingJiraWrite, 'savedAt'>): void {
  if (write.path.replace(/^\//, '') === 'rest/api/3/issue/0/worklog/0') return;
  const next: PendingJiraWrite = { ...write, savedAt: Date.now() };
  const current = readStored();
  const last = current[current.length - 1];
  const burst = last !== undefined && next.savedAt - last.savedAt <= BURST_MS ? current : [];
  const previous = burst[burst.length - 1];
  const same =
    previous !== undefined &&
    previous.method === next.method &&
    previous.path === next.path &&
    JSON.stringify(previous.data) === JSON.stringify(next.data);
  const list = (same ? burst.slice(0, -1) : burst).concat(next).slice(-MAX_WRITES);
  writeStored(list);
}

export function readPendingJiraWrites(): PendingJiraWrite[] {
  const writes = readStored();
  writeStored(writes);
  return writes;
}

export function takePendingJiraWrites(): PendingJiraWrite[] {
  const writes = readStored();
  writeStored([]);
  return writes;
}

export function clearPendingJiraWrites(): void {
  writeStored([]);
}

function isWorklogAdd(write: PendingJiraWrite): boolean {
  const data = write.data;
  if (!data || typeof data !== 'object') return false;
  const update = (data as { update?: { worklog?: unknown } }).update;
  return Array.isArray(update?.worklog);
}

function copyFor(write: PendingJiraWrite): WriteCopy {
  const path = write.path.replace(/^\//, '');
  if (/\/transitions$/.test(path)) {
    return {
      saved: 'A mudança de status ficou salva neste navegador. Ao entrar de novo, ela será concluída.',
      done: 'A mudança de status foi concluída.',
    };
  }
  if (/\/assignee$/.test(path)) {
    return {
      saved: 'A troca de responsável ficou salva neste navegador. Ao entrar de novo, ela será concluída.',
      done: 'A troca de responsável foi concluída.',
    };
  }
  if (/\/worklog\/[^/]+$/.test(path)) {
    return {
      saved: 'A edição do apontamento ficou salva neste navegador. Ao entrar de novo, ela será concluída.',
      done: 'A edição do apontamento foi concluída.',
    };
  }
  if (/\/worklog$/.test(path) || isWorklogAdd(write)) {
    return {
      saved: 'O lançamento de horas ficou salvo neste navegador. Ao entrar de novo, ele será concluído.',
      done: 'O lançamento de horas foi concluído.',
    };
  }
  if (path === 'rest/api/3/issue' && write.method === 'POST') {
    return {
      saved: 'A criação da issue ficou salva neste navegador. Ao entrar de novo, ela será concluída.',
      done: 'A criação da issue foi concluída.',
    };
  }
  if (/^rest\/api\/3\/issue\/[^/]+$/.test(path)) {
    return {
      saved: 'A edição da issue ficou salva neste navegador. Ao entrar de novo, ela será concluída.',
      done: 'A edição da issue foi concluída.',
    };
  }
  return {
    saved: 'A alteração ficou salva neste navegador. Ao entrar de novo, ela será concluída.',
    done: 'A alteração foi concluída.',
  };
}

const SEVERAL_SAVED =
  'As alterações que você estava fazendo ficaram salvas neste navegador. Ao entrar de novo, elas serão concluídas.';
const SEVERAL_DONE = 'As alterações foram concluídas.';

export function pendingJiraWriteNotice(): string | null {
  const writes = readPendingJiraWrites();
  if (writes.length === 0) return null;
  if (writes.length > 1) return SEVERAL_SAVED;
  return copyFor(writes[0]).saved;
}

export function pendingJiraWriteDone(writes: PendingJiraWrite[]): string {
  if (writes.length > 1) return SEVERAL_DONE;
  if (writes.length === 1) return copyFor(writes[0]).done;
  return 'A alteração foi concluída.';
}
