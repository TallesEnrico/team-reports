import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { readDashboardLink, SHARED_DASHBOARD_PARAM } from '../lib/dashboardLink';
import { type ImportResult, parseDashboardFile } from '../lib/transfer';

/** O dashboard do link, validado; ou o link quebrado. */
export type SharedLinkResult = ImportResult | { ok: false; error: string };

/**
 * Dashboard de um link compartilhado (`/dashboard?dashboard=…`): lido e
 * validado como um arquivo importado, para a tela perguntar antes de importar.
 * O parâmetro sai do endereço na hora: recarregar a página não pergunta de novo.
 */
export function useSharedDashboardLink() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const payload = searchParams.get(SHARED_DASHBOARD_PARAM);
  const [shared, setShared] = useState<SharedLinkResult | null>(null);
  // O parâmetro sai do endereço logo depois; isto lembra que a tela abriu por um link.
  const [openedWithLink] = useState(() => payload !== null);

  useEffect(() => {
    if (!payload) return;
    navigate({ search: '' }, { replace: true });
    // Sem cancelar ao tirar o parâmetro: a leitura é deste link, e o resultado vale.
    void readDashboardLink(payload).then((content) =>
      setShared(
        content === null
          ? { ok: false, error: 'O link está quebrado ou incompleto. Peça para enviar de novo.' }
          : parseDashboardFile(content),
      ),
    );
  }, [payload, navigate]);

  return {
    shared,
    /** A tela abriu por um link compartilhado (a primeira visita não ganha o modelo de exemplo). */
    openedWithLink,
    dismiss: () => setShared(null),
  };
}
