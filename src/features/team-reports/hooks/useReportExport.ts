import { useState } from 'react';
import type { ExportFormat, ExportModel } from '../lib/buildExportModel';

// Import dinâmico: jsPDF e o gerador de .xlsx só são baixados quando o formato é usado.
const EXPORTERS: Record<ExportFormat, (model: ExportModel) => Promise<void>> = {
  pdf: (model) => import('../lib/exportReportPdf').then((module) => module.exportReportPdf(model)),
  html: (model) => import('../lib/exportReportHtml').then((module) => module.exportReportHtml(model)),
  xlsx: (model) => import('../lib/exportReportExcel').then((module) => module.exportReportExcel(model)),
};

export function useReportExport() {
  const [pendingFormat, setPendingFormat] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exportReport(format: ExportFormat, buildModel: () => ExportModel) {
    setPendingFormat(format);
    setError(null);
    try {
      await EXPORTERS[format](buildModel());
    } catch (cause) {
      console.error(cause);
      setError('Não foi possível gerar o arquivo. Tente novamente.');
    } finally {
      setPendingFormat(null);
    }
  }

  return { exportReport, pendingFormat, error };
}
