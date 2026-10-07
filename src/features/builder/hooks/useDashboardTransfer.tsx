import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { downloadBlob } from '../../../lib/downloadFile';
import { plural } from '../lib/format';
import { blockCount, exportFileName, MAX_IMPORT_BYTES, parseDashboardFile, serializeDashboard } from '../lib/transfer';
import { useBuilderStore } from '../store/useBuilderStore';
import type { Dashboard } from '../types';

export interface TransferFeedback {
  tone: 'success' | 'error';
  message: string;
}

/** Quanto tempo o aviso de importação bem-sucedida fica na tela. */
const SUCCESS_MS = 6000;

/**
 * Exportar o dashboard aberto (um arquivo .json com a montagem, sem dados do
 * Jira) e importar um arquivo desses como um dashboard novo.
 */
export function useDashboardTransfer() {
  const importDashboard = useBuilderStore((state) => state.importDashboard);
  const inputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<TransferFeedback | null>(null);

  useEffect(() => {
    if (feedback?.tone !== 'success') return;
    const timer = window.setTimeout(() => setFeedback(null), SUCCESS_MS);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  function exportDashboard(dashboard: Dashboard) {
    downloadBlob(exportFileName(dashboard.name), new Blob([serializeDashboard(dashboard)], { type: 'application/json' }));
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // O mesmo arquivo pode ser escolhido de novo.
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setFeedback({ tone: 'error', message: `"${file.name}" é grande demais para um dashboard (até 2 MB).` });
      return;
    }
    const result = parseDashboardFile(await file.text());
    if (!result.ok) {
      setFeedback({ tone: 'error', message: `Não foi possível importar "${file.name}": ${result.error}` });
      return;
    }
    importDashboard(result.dashboard);
    const { name, skipped } = result.dashboard;
    const ignored = skipped > 0 ? ` ${plural(skipped, 'peça ou ligação inválida ficou', 'peças ou ligações inválidas ficaram')} de fora.` : '';
    setFeedback({
      tone: 'success',
      message: `Dashboard "${name}" importado, com ${plural(blockCount(result.dashboard), 'bloco', 'blocos')}.${ignored}`,
    });
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept=".json,application/json"
      hidden
      aria-hidden
      tabIndex={-1}
      onChange={(event) => void handleFile(event)}
    />
  );

  return {
    exportDashboard,
    /** Abre a escolha do arquivo a importar. */
    pickFile: () => inputRef.current?.click(),
    fileInput,
    feedback,
    clearFeedback: () => setFeedback(null),
  };
}
