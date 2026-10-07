import { ChartBar, ChartLineUp, type Icon, Kanban, PuzzlePiece } from '@phosphor-icons/react';
import type { BrandProduct } from './BrandLogo';

/** A planilha (Spreadsheet) é uma visualização do Kanban, não uma ferramenta à parte. */
export type ToolProduct = Exclude<BrandProduct, 'spreadsheet'>;

export interface ToolLink {
  product: ToolProduct;
  to: string;
  name: string;
  /** Uma linha, para o menu da lateral. */
  tagline: string;
  /** Texto do card na página inicial. */
  description: string;
}

/** Ferramentas do app, na ordem do menu e dos cards. */
export const TOOLS: ToolLink[] = [
  {
    product: 'reports',
    to: '/reports',
    name: 'Reports',
    tagline: 'Horas apontadas por dia',
    description:
      'Horas lançadas no Jira por dia, issue e pessoa, com totais por período. Edite apontamentos e exporte em PDF, HTML ou Excel.',
  },
  {
    product: 'kanban',
    to: '/kanban',
    name: 'Kanban',
    tagline: 'Seus cards no quadro',
    description:
      'Os seus cards no quadro da squad, como no Jira: arraste entre as colunas para mudar o status, pesquise tarefas e lance horas sem sair da tela. Ou veja o quadro em planilha, para ordenar e somar os tempos.',
  },
  {
    product: 'metrics',
    to: '/metrics',
    name: 'Metrics',
    tagline: 'Indicadores de horas da squad',
    description:
      'Horas da squad no mês contra a jornada esperada: quem está sem lançar, cobertura por pessoa, gráficos por dia, projeto e issue, e a comparação entre meses.',
  },
  {
    product: 'builder',
    to: '/dashboard',
    name: 'Dashboard',
    tagline: 'Monte o seu dashboard',
    description:
      'Monte o seu próprio dashboard encaixando peças: escolha os dados do Jira, filtre, agrupe e cruze o que quiser, e veja os gráficos aparecerem.',
  },
];

/** Configurações: no fim do menu, depois das ferramentas (sem card na página inicial). */
export const SETTINGS_LINK = { to: '/settings', name: 'Configurações', tagline: 'Squad, tema e MCP' };

/** Ícone de cada ferramenta (menu da lateral e menu da logo). */
export const TOOL_ICONS: Record<ToolProduct, Icon> = {
  reports: ChartBar,
  kanban: Kanban,
  metrics: ChartLineUp,
  builder: PuzzlePiece,
};
