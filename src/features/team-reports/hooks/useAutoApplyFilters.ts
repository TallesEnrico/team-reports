import { useEffect } from 'react';
import { areFiltersEqual } from '../lib/areFiltersEqual';
import { validateFilters } from '../lib/validateFilters';
import { useReportFiltersStore } from '../store/useReportFiltersStore';

const APPLY_DELAY_MS = 400;
// Digitando JQL a consulta fica inválida pela metade; espera uma pausa maior.
const APPLY_JQL_DELAY_MS = 900;

export type AutoApplyStatus =
  /** Relatório ainda não gerado nesta sessão: nada é aplicado sozinho. */
  | 'off'
  /** Painel e relatório em sincronia. */
  | 'synced'
  /** Há mudança válida esperando o debounce. */
  | 'pending'
  /** Há mudança, mas os filtros estão inválidos (ex: De depois de Até). */
  | 'invalid';

/**
 * Depois do primeiro "Gerar relatório", aplica sozinho cada mudança válida do
 * painel, com debounce para não consultar o Jira a cada tecla.
 */
export function useAutoApplyFilters(): AutoApplyStatus {
  const draft = useReportFiltersStore((state) => state.draft);
  const applied = useReportFiltersStore((state) => state.applied);
  const applyDraft = useReportFiltersStore((state) => state.applyDraft);

  const isOn = applied !== null;
  const hasChanges = isOn && !areFiltersEqual(draft, applied);
  const isValid = validateFilters(draft) === null;
  const isTypingJql = hasChanges && draft.jql !== applied.jql;

  useEffect(() => {
    if (!hasChanges || !isValid) return;
    // `draft` nas dependências reinicia a espera a cada nova mudança.
    const timeout = setTimeout(applyDraft, isTypingJql ? APPLY_JQL_DELAY_MS : APPLY_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [draft, hasChanges, isValid, isTypingJql, applyDraft]);

  if (!isOn) return 'off';
  if (!hasChanges) return 'synced';
  return isValid ? 'pending' : 'invalid';
}
