import { createContext, useContext } from 'react';
import type { JiraIssue } from '../../../api/jira-issues';
import type { BuilderEdge, BuilderNode, Dashboard, PeriodConfig, PieceResult } from '../types';

export interface BuilderContextValue {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  /** O que sai de cada peça, pelo id. */
  results: Record<string, PieceResult>;
  connectedSquad: string | undefined;
  /** O período do dashboard aberto (o seletor do cabeçalho). */
  dashboardPeriod: PeriodConfig;
  /** Abre o modal da issue (a chave numa barra, numa linha da tabela). */
  openIssue: (issue: JiraIssue) => void;
  issueHref: (issueKey: string) => string;
  /** Vai para a montagem com a peça selecionada (o "Editar" de cada bloco do dashboard). */
  editPiece: (nodeId: string) => void;
  /** Abre a escolha de um arquivo .json para importar como dashboard novo. */
  importDashboardFile: () => void;
  /** Baixa o dashboard num arquivo .json (a montagem, sem dados do Jira). */
  exportDashboard: (dashboard: Dashboard) => void;
  /** Abre a IA: criar um dashboard novo ou mudar o aberto. */
  openAiDialog: (mode: 'create' | 'edit') => void;
}

export const BuilderContext = createContext<BuilderContextValue | null>(null);

/** Dados e ações da tela, para as peças do quadro e os blocos do dashboard. */
export function useBuilderContext(): BuilderContextValue {
  const value = useContext(BuilderContext);
  if (!value) throw new Error('useBuilderContext fora do BuilderPage');
  return value;
}

/** O que entra numa peça: o resultado da peça ligada à entrada dela. */
export function inputResultOf(context: BuilderContextValue, nodeId: string): PieceResult | undefined {
  const edge = context.edges.find((item) => item.target === nodeId);
  return edge ? context.results[edge.source] : undefined;
}
