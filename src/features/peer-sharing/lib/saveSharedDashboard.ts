import type { ImportedDashboard } from '../../builder/lib/transfer';

/**
 * Guarda o dashboard aceito entre os dashboards deste navegador, como um
 * importado, e deixa ele aberto na visualização "Dashboard". O editor fica fora
 * do pacote inicial: a store dele vem sob demanda.
 */
export async function saveSharedDashboard(dashboard: ImportedDashboard): Promise<void> {
  const { useBuilderStore } = await import('../../builder/store/useBuilderStore');
  // Antes de ler o IndexedDB, um dashboard novo seria gravado por cima dos salvos.
  if (!useBuilderStore.persist.hasHydrated()) {
    await new Promise<void>((resolve) => {
      const unsubscribe = useBuilderStore.persist.onFinishHydration(() => {
        unsubscribe();
        resolve();
      });
    });
  }
  const { importDashboard, setMode } = useBuilderStore.getState();
  importDashboard(dashboard);
  setMode('view');
}
