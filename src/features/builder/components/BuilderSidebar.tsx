import { DashboardList } from './DashboardList';
import { PiecePalette } from './PiecePalette';

/** Lateral do Dashboard: os dashboards e, na montagem (com um dashboard aberto), as peças para arrastar. */
export function BuilderSidebar({ showPalette }: { showPalette: boolean }) {
  // `nokey`: Backspace num botão da lateral não apaga a peça selecionada no quadro.
  return (
    <div className="nokey">
      <DashboardList />
      {showPalette && <PiecePalette />}
    </div>
  );
}
