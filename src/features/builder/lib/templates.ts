import type { BuilderEdge, BuilderNode, PeopleChoice, PieceConfigs, PieceKind, SourceKind } from '../types';
import { defaultConfig } from './catalog';

export function newId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}-${random.slice(0, 8)}`;
}

/** Peça nova no quadro (o tipo e a configuração andam juntos; o TypeScript não liga os dois num genérico). */
export function createNode<Kind extends PieceKind>(
  kind: Kind,
  position: { x: number; y: number },
  data: PieceConfigs[Kind],
  id = newId(kind),
): BuilderNode {
  return { id, type: kind, position, data } as unknown as BuilderNode;
}

export function newEdge(source: string, target: string): BuilderEdge {
  return { id: newId('e'), source, target };
}

export type TemplateId = 'company-month' | 'open-issues' | 'squad-month' | 'my-hours' | 'blank';

export interface DashboardTemplate {
  id: TemplateId;
  name: string;
  description: string;
}

export const TEMPLATES: DashboardTemplate[] = [
  {
    id: 'company-month',
    name: 'Visão da empresa no mês',
    description: 'Todas as squads e pessoas: horas por squad e por semana, quem mais lançou, onde cada squad lança horas e as squads em cada dia.',
  },
  {
    id: 'open-issues',
    name: 'Issues abertas por squad',
    description: 'Todas as squads: situação e estimativa das issues abertas por squad e a lista das que passaram da estimativa.',
  },
  {
    id: 'squad-month',
    name: 'Horas da minha squad',
    description: 'A squad da sua conta no mês: totais, horas por pessoa e por dia, quem lançou em cada dia e os projetos.',
  },
  {
    id: 'my-hours',
    name: 'Minhas horas',
    description: 'As suas horas no mês em qualquer squad: por dia, nas issues com mais horas e por dia da semana.',
  },
  {
    id: 'blank',
    name: 'Em branco',
    description: 'Um quadro vazio para montar do zero, peça por peça.',
  },
];

/** Monta as peças de um modelo: `piece` posiciona e devolve o id; `link` liga duas peças. */
function layout(build: (tools: {
  piece: <Kind extends PieceKind>(kind: Kind, x: number, y: number, config?: Partial<PieceConfigs[Kind]>, source?: SourceKind) => string;
  link: (source: string, target: string) => void;
}) => void): { nodes: BuilderNode[]; edges: BuilderEdge[] } {
  const nodes: BuilderNode[] = [];
  const edges: BuilderEdge[] = [];
  build({
    piece: (kind, x, y, config, source) => {
      const node = createNode(kind, { x, y }, { ...defaultConfig(kind, source), ...config });
      nodes.push(node);
      return node.id;
    },
    link: (source, target) => void edges.push(newEdge(source, target)),
  });
  return { nodes, edges };
}

// Colunas do quadro: dados, transformar, mostrar (e uma a mais para Ordenar → Mostrar).
const COL = [0, 340, 680, 1020, 1360];

const ME: PeopleChoice = { mode: 'me', accountIds: [], names: {} };

export function buildTemplate(id: TemplateId): { nodes: BuilderNode[]; edges: BuilderEdge[] } {
  switch (id) {
    case 'company-month':
      return layout(({ piece, link }) => {
        // Todas as squads e todas as pessoas (o padrão das peças de dados).
        const hours = piece('worklogs', COL[0], 360);
        link(hours, piece('number', COL[1], -260, { measure: 'hours', title: 'Horas lançadas' }));
        link(hours, piece('number', COL[2], -260, { measure: 'people', title: 'Pessoas que lançaram' }));
        link(hours, piece('number', COL[3], -260, { measure: 'squads', title: 'Squads com horas' }));
        link(hours, piece('number', COL[4], -260, { measure: 'average', title: 'Média por dia lançado' }));

        const bySquad = piece('group', COL[1], 0, { by: 'project', measure: 'hours' });
        link(hours, bySquad);
        link(bySquad, piece('bars', COL[2], 0, { title: 'Horas por squad' }));

        const byWeek = piece('group', COL[1], 240, { by: 'week', series: 'project', measure: 'hours' });
        link(hours, byWeek);
        link(byWeek, piece('columns', COL[2], 240, { title: 'Horas por semana e squad' }));

        const byPerson = piece('group', COL[1], 480, { by: 'person', series: 'project', measure: 'hours' });
        const topPeople = piece('sort', COL[2], 480, { order: 'value-desc', limit: 15, others: false });
        link(hours, byPerson);
        link(byPerson, topPeople);
        link(topPeople, piece('bars', COL[3], 480, { title: 'Quem mais lançou horas' }));

        const squadOfPerson = piece('group', COL[1], 720, { by: 'personSquad', series: 'project', measure: 'hours' });
        link(hours, squadOfPerson);
        link(squadOfPerson, piece('bars', COL[3], 720, { title: 'Onde as pessoas de cada squad lançam horas' }));

        const squadDay = piece('group', COL[1], 960, { by: 'project', series: 'day', measure: 'hours' });
        link(hours, squadDay);
        link(squadDay, piece('heatmap', COL[2], 960, { title: 'Horas de cada squad por dia' }));
      });

    case 'open-issues':
      return layout(({ piece, link }) => {
        const open = piece('issues', COL[0], 280, { selection: 'open' });
        link(open, piece('number', COL[1], -240, { measure: 'count', title: 'Issues abertas', width: 'third' }));
        link(open, piece('number', COL[2], -240, { measure: 'overCount', title: 'Acima da estimativa', width: 'third' }));
        link(open, piece('number', COL[3], -240, { measure: 'remaining', title: 'Tempo restante', width: 'third' }));

        const bySquad = piece('group', COL[1], 0, { by: 'project', series: 'statusCategory', measure: 'count' }, 'issues');
        link(open, bySquad);
        link(bySquad, piece('bars', COL[2], 0, { title: 'Issues por squad e situação' }));

        const estimate = piece('group', COL[1], 240, { by: 'project', series: 'estimate', measure: 'count' }, 'issues');
        link(open, estimate);
        link(estimate, piece('bars', COL[2], 240, { title: 'Estimativa das issues por squad' }));

        const over = piece('filter', COL[1], 480, {
          field: 'estimate',
          mode: 'include',
          values: ['over'],
          labels: { over: 'Acima da estimativa' },
        });
        link(open, over);
        link(over, piece('table', COL[2], 480, { title: 'Issues acima da estimativa' }));
      });

    case 'squad-month':
      return layout(({ piece, link }) => {
        const hours = piece('worklogs', COL[0], 300, { projectKeys: null });
        // Primeira linha do dashboard: os totais.
        link(hours, piece('number', COL[1], -260, { measure: 'hours', title: 'Horas lançadas' }));
        link(hours, piece('number', COL[2], -260, { measure: 'people', title: 'Pessoas que lançaram' }));
        link(hours, piece('number', COL[3], -260, { measure: 'issues', title: 'Issues com horas' }));
        link(hours, piece('number', COL[4], -260, { measure: 'average', title: 'Média por dia lançado' }));

        const byPerson = piece('group', COL[1], 0, { by: 'person', measure: 'hours' });
        link(hours, byPerson);
        link(byPerson, piece('bars', COL[2], 0, { title: 'Horas por pessoa' }));

        const byDay = piece('group', COL[1], 240, { by: 'day', measure: 'hours' });
        link(hours, byDay);
        link(byDay, piece('columns', COL[2], 240, { title: 'Horas por dia' }));

        const personDay = piece('group', COL[1], 480, { by: 'person', series: 'day', measure: 'hours' });
        link(hours, personDay);
        link(personDay, piece('heatmap', COL[2], 480, { title: 'Quem lançou em cada dia' }));

        const byType = piece('group', COL[1], 760, { by: 'type', series: 'person', measure: 'hours' });
        link(hours, byType);
        link(byType, piece('bars', COL[2], 760, { title: 'Horas por tipo de issue e pessoa', width: 'full' }));
      });

    case 'my-hours':
      return layout(({ piece, link }) => {
        const mine = piece('worklogs', COL[0], 280, { people: ME });
        link(mine, piece('number', COL[1], -240, { measure: 'hours', title: 'Minhas horas no mês', width: 'third' }));
        link(mine, piece('number', COL[2], -240, { measure: 'days', title: 'Dias com lançamento', width: 'third' }));
        link(mine, piece('number', COL[3], -240, { measure: 'average', title: 'Média por dia', width: 'third' }));

        const byDay = piece('group', COL[1], 0, { by: 'day', series: 'project', measure: 'hours' });
        link(mine, byDay);
        link(byDay, piece('columns', COL[2], 0, { title: 'Horas por dia e squad', width: 'full' }));

        const byIssue = piece('group', COL[1], 260, { by: 'issue', measure: 'hours' });
        const top = piece('sort', COL[2], 260, { order: 'value-desc', limit: 10, others: false });
        link(mine, byIssue);
        link(byIssue, top);
        link(top, piece('bars', COL[3], 260, { title: 'Issues com mais horas' }));

        const byWeekday = piece('group', COL[1], 520, { by: 'weekday', measure: 'average' });
        link(mine, byWeekday);
        link(byWeekday, piece('bars', COL[3], 520, { title: 'Média por dia da semana' }));
      });

    case 'blank':
      return { nodes: [], edges: [] };
  }
}
