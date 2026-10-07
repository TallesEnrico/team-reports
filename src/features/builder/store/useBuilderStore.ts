import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from '@xyflow/react';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { createIndexedDbStorage } from '../../../lib/indexedDbStorage';
import { allPeople, defaultConfig, isVisualKind } from '../lib/catalog';
import { DEFAULT_DASHBOARD_PERIOD } from '../lib/periods';
import type { ImportedDashboard } from '../lib/transfer';
import { buildTemplate, createNode, newEdge, newId, TEMPLATES, type TemplateId } from '../lib/templates';
import type {
  BuilderEdge,
  BuilderMode,
  BuilderNode,
  Dashboard,
  PeopleChoice,
  PeriodConfig,
  PieceConfigs,
  PieceKind,
  SourceKind,
} from '../types';

/** Distância entre uma peça e a seguinte, quando ela é encaixada pelo "+" ou pela paleta. */
const NEXT_OFFSET = { x: 340, y: 0 };
const FREE_STEP = 210;

interface BuilderState {
  dashboards: Dashboard[];
  activeId: string | null;
  mode: BuilderMode;
  /** Largura do painel da peça, na montagem; `null` = a padrão. Vale para todos os dashboards. */
  inspectorWidth: number | null;
  /**
   * Muda quando as peças do dashboard aberto são trocadas de uma vez (a IA, o
   * "Desfazer"): o quadro recomeça e enquadra as peças nas posições novas. Não é salvo.
   */
  canvasRevision: number;
  setInspectorWidth: (width: number | null) => void;
  /**
   * A primeira visita já ganhou o modelo de exemplo: quem apagar todos os
   * dashboards não ganha outro a cada visita.
   */
  seeded: boolean;
  /** Cria um dashboard (vazio ou de um modelo), abre ele e devolve o id. */
  createDashboard: (template: TemplateId) => string;
  selectDashboard: (id: string) => void;
  /** Cria um dashboard a partir de um arquivo importado (já validado), com ids novos, e abre ele. */
  importDashboard: (imported: ImportedDashboard) => string;
  /** Troca as peças, o nome e o período de um dashboard (a edição pela IA); ele continua aberto. */
  replaceDashboard: (id: string, content: Pick<Dashboard, 'name' | 'period' | 'nodes' | 'edges'>) => void;
  /** Volta um dashboard a uma versão guardada (o "Desfazer" da edição pela IA) e abre ele. */
  restoreDashboard: (snapshot: Dashboard) => void;
  renameDashboard: (id: string, name: string) => void;
  /** Troca o período do dashboard aberto (o seletor do cabeçalho). */
  setDashboardPeriod: (period: PeriodConfig) => void;
  /** Cria uma cópia do dashboard (com o nome escolhido; sem ele, "<nome> (cópia)") e abre ela. */
  duplicateDashboard: (id: string, name?: string) => void;
  deleteDashboard: (id: string) => void;
  setMode: (mode: BuilderMode) => void;
  /** Mudanças do quadro (mover, selecionar, apagar com Delete/Backspace). */
  changeNodes: (changes: NodeChange<BuilderNode>[]) => void;
  changeEdges: (changes: EdgeChange<BuilderEdge>[]) => void;
  /** Liga duas peças; a entrada é uma só, então uma ligação nova troca a antiga. */
  connect: (connection: Connection) => void;
  /**
   * Põe uma peça no quadro. Com `after`, ela encaixa na saída dessa peça, ao lado
   * dela (com `viaGroup`, um "Agrupar e cruzar" entra no meio, configurado para
   * ela); senão vai para `position` (com `avoidOverlap`, o primeiro lugar livre a partir dela).
   */
  addPiece: (
    kind: PieceKind,
    options?: { position?: XYPosition; after?: string; source?: SourceKind; avoidOverlap?: boolean; viaGroup?: boolean },
  ) => string;
  /** Encaixa um "Agrupar e cruzar" entre a peça e o que entra nela. */
  insertGroupBefore: (nodeId: string, source: SourceKind | undefined) => void;
  updateConfig: <Kind extends PieceKind>(nodeId: string, patch: Partial<PieceConfigs[Kind]>) => void;
  removePiece: (nodeId: string) => void;
  duplicatePiece: (nodeId: string) => void;
  /** Seleciona só esta peça (`null`: nenhuma). */
  selectPiece: (nodeId: string | null) => void;
}

function nameFor(template: TemplateId, dashboards: Dashboard[]): string {
  const base = template === 'blank' ? 'Novo dashboard' : TEMPLATES.find((item) => item.id === template)!.name;
  const taken = new Set(dashboards.map((dashboard) => dashboard.name));
  if (!taken.has(base)) return base;
  for (let index = 2; ; index++) if (!taken.has(`${base} ${index}`)) return `${base} ${index}`;
}

/** Primeira posição livre a partir de `start`, descendo (as peças não ficam umas sobre as outras). */
function freePosition(nodes: BuilderNode[], start: XYPosition): XYPosition {
  const position = { ...start };
  const isTaken = () =>
    nodes.some((node) => Math.abs(node.position.x - position.x) < 200 && Math.abs(node.position.y - position.y) < 120);
  for (let tries = 0; isTaken() && tries < 40; tries++) position.y += FREE_STEP;
  return position;
}

/** Só o que a montagem precisa (sem seleção, arrasto e medidas do React Flow). */
function cleanNode(node: BuilderNode): BuilderNode {
  return { id: node.id, type: node.type, position: node.position, data: node.data } as BuilderNode;
}

function cleanEdge(edge: BuilderEdge): BuilderEdge {
  return { id: edge.id, source: edge.source, target: edge.target };
}

/**
 * Grava no IndexedDB com um pequeno atraso: arrastar uma peça muda a posição a
 * cada quadro, e cada mudança gravaria o estado inteiro.
 */
function createDebouncedStorage<State>(storage: PersistStorage<State, Promise<void>>, delayMs: number): PersistStorage<State, Promise<void>> {
  const timers = new Map<string, number>();
  const pending = new Map<string, StorageValue<State>>();

  function flush(name: string) {
    window.clearTimeout(timers.get(name));
    timers.delete(name);
    const value = pending.get(name);
    pending.delete(name);
    if (value) void storage.setItem(name, value);
  }

  if (typeof window !== 'undefined') {
    // Fechando a aba ou trocando de app, grava o que falta na hora.
    window.addEventListener('pagehide', () => [...pending.keys()].forEach(flush));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') [...pending.keys()].forEach(flush);
    });
  }

  return {
    getItem: storage.getItem,
    removeItem: storage.removeItem,
    setItem: async (name, value) => {
      pending.set(name, value);
      window.clearTimeout(timers.get(name));
      timers.set(name, window.setTimeout(() => flush(name), delayMs));
    },
  };
}

/** O dashboard aberto: o escolhido ou, se ele não existe mais, o primeiro. */
function activeIdOf(state: Pick<BuilderState, 'dashboards' | 'activeId'>): string | undefined {
  return state.dashboards.some((dashboard) => dashboard.id === state.activeId) ? state.activeId! : state.dashboards[0]?.id;
}

/**
 * Dashboard de antes do seletor de período: o período dele passa a ser o da
 * primeira peça de dados que usa período, e as peças com esse mesmo período
 * passam a seguir o dashboard (as outras ficam com o próprio). Os números não mudam.
 */
function withDashboardPeriod(dashboard: Dashboard): Dashboard {
  if (dashboard.period) return dashboard;
  const usesPeriod = (node: BuilderNode) =>
    node.type === 'worklogs' || (node.type === 'issues' && node.data.selection !== 'open');
  const first = dashboard.nodes.find(usesPeriod) as Extract<BuilderNode, { type: 'worklogs' | 'issues' }> | undefined;
  const period = first?.data.period ?? DEFAULT_DASHBOARD_PERIOD;
  const same = (other: PeriodConfig) => other.preset === period.preset && other.from === period.from && other.to === period.to;
  return {
    ...dashboard,
    period,
    nodes: dashboard.nodes.map((node) =>
      (node.type === 'worklogs' || node.type === 'issues') && same(node.data.period)
        ? ({ ...node, data: { ...node.data, period: { preset: 'dashboard', from: null, to: null } } } as BuilderNode)
        : node,
    ),
  };
}

type PersistedBuilder = Pick<BuilderState, 'dashboards' | 'activeId' | 'mode' | 'seeded' | 'inspectorWidth'>;

export const useBuilderStore = create<BuilderState>()(
  persist(
    (set, get) => {
      /** Muda o dashboard aberto. */
      function updateActive(update: (dashboard: Dashboard) => Partial<Dashboard> | null) {
        set((state) => {
          const activeId = activeIdOf(state);
          return {
            dashboards: state.dashboards.map((dashboard) => {
              if (dashboard.id !== activeId) return dashboard;
              const patch = update(dashboard);
              return patch ? { ...dashboard, ...patch, updatedAt: Date.now() } : dashboard;
            }),
          };
        });
      }

      function activeDashboard(): Dashboard | undefined {
        const state = get();
        const activeId = activeIdOf(state);
        return state.dashboards.find((dashboard) => dashboard.id === activeId);
      }

      return {
        dashboards: [],
        activeId: null,
        mode: 'build',
        inspectorWidth: null,
        canvasRevision: 0,
        seeded: false,

        createDashboard: (template) => {
          const id = newId('dash');
          set((state) => ({
            dashboards: [
              ...state.dashboards,
              {
                id,
                name: nameFor(template, state.dashboards),
                period: DEFAULT_DASHBOARD_PERIOD,
                ...buildTemplate(template),
                updatedAt: Date.now(),
              },
            ],
            activeId: id,
            mode: 'build',
            seeded: true,
          }));
          return id;
        },
        selectDashboard: (id) => set({ activeId: id }),
        importDashboard: (imported) => {
          const id = newId('dash');
          set((state) => {
            const ids = new Map(imported.nodes.map((node) => [node.id, newId(node.type)]));
            const taken = new Set(state.dashboards.map((dashboard) => dashboard.name));
            let name = imported.name;
            for (let index = 2; taken.has(name); index++) name = `${imported.name} (${index})`;
            const dashboard: Dashboard = {
              id,
              name,
              period: imported.period,
              nodes: imported.nodes.map((node) => ({ ...cleanNode(node), id: ids.get(node.id)! }) as BuilderNode),
              edges: imported.edges.map((edge) => newEdge(ids.get(edge.source)!, ids.get(edge.target)!)),
              updatedAt: Date.now(),
            };
            return { dashboards: [...state.dashboards, dashboard], activeId: id, seeded: true };
          });
          return id;
        },
        replaceDashboard: (id, content) =>
          set((state) => ({
            dashboards: state.dashboards.map((dashboard) =>
              dashboard.id === id
                ? {
                    ...dashboard,
                    name: content.name,
                    period: content.period,
                    nodes: content.nodes.map(cleanNode),
                    edges: content.edges.map(cleanEdge),
                    updatedAt: Date.now(),
                  }
                : dashboard,
            ),
            canvasRevision: state.canvasRevision + 1,
          })),
        restoreDashboard: (snapshot) =>
          set((state) => ({
            // Apagado depois da edição, ele volta para a lista.
            dashboards: state.dashboards.some((dashboard) => dashboard.id === snapshot.id)
              ? state.dashboards.map((dashboard) => (dashboard.id === snapshot.id ? snapshot : dashboard))
              : [...state.dashboards, snapshot],
            activeId: snapshot.id,
            canvasRevision: state.canvasRevision + 1,
          })),
        setDashboardPeriod: (period) => updateActive(() => ({ period })),
        renameDashboard: (id, name) =>
          set((state) => ({
            dashboards: state.dashboards.map((dashboard) =>
              dashboard.id === id ? { ...dashboard, name, updatedAt: Date.now() } : dashboard,
            ),
          })),
        duplicateDashboard: (id, name) =>
          set((state) => {
            const original = state.dashboards.find((dashboard) => dashboard.id === id);
            if (!original) return {};
            // Ids novos: as peças da cópia não se confundem com as do original.
            const ids = new Map(original.nodes.map((node) => [node.id, newId(node.type)]));
            const copy: Dashboard = {
              id: newId('dash'),
              name: name ?? `${original.name} (cópia)`,
              period: original.period,
              nodes: original.nodes.map((node) => ({ ...cleanNode(node), id: ids.get(node.id)! }) as BuilderNode),
              edges: original.edges.map((edge) => newEdge(ids.get(edge.source)!, ids.get(edge.target)!)),
              updatedAt: Date.now(),
            };
            return { dashboards: [...state.dashboards, copy], activeId: copy.id };
          }),
        deleteDashboard: (id) =>
          set((state) => {
            const index = state.dashboards.findIndex((dashboard) => dashboard.id === id);
            const dashboards = state.dashboards.filter((dashboard) => dashboard.id !== id);
            const activeId =
              state.activeId === id ? (dashboards[Math.min(index, dashboards.length - 1)]?.id ?? null) : state.activeId;
            return { dashboards, activeId };
          }),
        setMode: (mode) => set({ mode }),
        setInspectorWidth: (inspectorWidth) => set({ inspectorWidth }),

        changeNodes: (changes) =>
          updateActive((dashboard) => {
            const nodes = applyNodeChanges(changes, dashboard.nodes);
            // Peça apagada leva as ligações dela.
            const ids = new Set(nodes.map((node) => node.id));
            const edges = dashboard.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
            return { nodes, edges: edges.length === dashboard.edges.length ? dashboard.edges : edges };
          }),
        changeEdges: (changes) => updateActive((dashboard) => ({ edges: applyEdgeChanges(changes, dashboard.edges) })),
        connect: (connection) =>
          updateActive((dashboard) => ({
            edges: [
              ...dashboard.edges.filter((edge) => edge.target !== connection.target),
              newEdge(connection.source, connection.target),
            ],
          })),

        addPiece: (kind, options = {}) => {
          const id = newId(kind);
          updateActive((dashboard) => {
            let nodes = dashboard.nodes.map((other) => (other.selected ? { ...other, selected: false } : other));
            let edges = dashboard.edges;
            let after = options.after ? nodes.find((node) => node.id === options.after) : undefined;
            if (after && options.viaGroup) {
              const group = createNode(
                'group',
                freePosition(nodes, { x: after.position.x + NEXT_OFFSET.x, y: after.position.y + NEXT_OFFSET.y }),
                defaultConfig('group', options.source, isVisualKind(kind) ? kind : undefined),
              );
              nodes = [...nodes, group];
              edges = [...edges, newEdge(after.id, group.id)];
              after = group;
            }
            const start = after
              ? { x: after.position.x + NEXT_OFFSET.x, y: after.position.y + NEXT_OFFSET.y }
              : (options.position ?? { x: 0, y: 0 });
            const position = after || options.avoidOverlap ? freePosition(nodes, start) : start;
            const node = { ...createNode(kind, position, defaultConfig(kind, options.source), id), selected: true };
            return { nodes: [...nodes, node], edges: after ? [...edges, newEdge(after.id, id)] : edges };
          });
          return id;
        },

        insertGroupBefore: (nodeId, source) =>
          updateActive((dashboard) => {
            const target = dashboard.nodes.find((node) => node.id === nodeId);
            const incoming = dashboard.edges.find((edge) => edge.target === nodeId);
            if (!target || !incoming) return null;
            const groupId = newId('group');
            // O Agrupar entra no lugar da peça, que anda uma casa para a direita (como encaixar no meio da fila).
            const group = createNode(
              'group',
              target.position,
              defaultConfig('group', source, isVisualKind(target.type) ? target.type : undefined),
              groupId,
            );
            const others = dashboard.nodes.filter((node) => node.id !== nodeId);
            const moved = {
              ...target,
              position: freePosition(others, { x: target.position.x + NEXT_OFFSET.x, y: target.position.y }),
            } as BuilderNode;
            return {
              nodes: [...others, group, moved],
              edges: [
                ...dashboard.edges.filter((edge) => edge.id !== incoming.id),
                newEdge(incoming.source, groupId),
                newEdge(groupId, nodeId),
              ],
            };
          }),

        updateConfig: (nodeId, patch) =>
          updateActive((dashboard) => ({
            nodes: dashboard.nodes.map((node) =>
              node.id === nodeId ? ({ ...node, data: { ...node.data, ...patch } } as BuilderNode) : node,
            ),
          })),
        removePiece: (nodeId) =>
          updateActive((dashboard) => ({
            nodes: dashboard.nodes.filter((node) => node.id !== nodeId),
            edges: dashboard.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
          })),
        duplicatePiece: (nodeId) => {
          const original = activeDashboard()?.nodes.find((node) => node.id === nodeId);
          if (!original) return;
          const id = newId(original.type);
          updateActive((dashboard) => {
            const copy = {
              ...cleanNode(original),
              id,
              position: freePosition(dashboard.nodes, { x: original.position.x, y: original.position.y + FREE_STEP }),
              selected: true,
            } as BuilderNode;
            // A cópia recebe os mesmos dados que o original.
            const incoming = dashboard.edges.find((edge) => edge.target === nodeId);
            return {
              nodes: [...dashboard.nodes.map((node) => (node.selected ? { ...node, selected: false } : node)), copy],
              edges: incoming ? [...dashboard.edges, newEdge(incoming.source, id)] : dashboard.edges,
            };
          });
        },
        selectPiece: (nodeId) =>
          updateActive((dashboard) => ({
            nodes: dashboard.nodes.map((node) =>
              Boolean(node.selected) === (node.id === nodeId) ? node : { ...node, selected: node.id === nodeId },
            ),
          })),
      };
    },
    {
      name: 'team-report:builder',
      version: 3,
      storage: createDebouncedStorage(createIndexedDbStorage<PersistedBuilder>(), 400),
      migrate: (persisted, version) => {
        const state = persisted as PersistedBuilder;
        // v1: "De quem" só tinha todas as pessoas ou só as minhas ('all' | 'me').
        if (version < 2) {
          const toChoice = (value: unknown): PeopleChoice =>
            value === 'me' ? { mode: 'me', accountIds: [], names: {} } : allPeople();
          state.dashboards = (state.dashboards ?? []).map((dashboard) => ({
            ...dashboard,
            nodes: dashboard.nodes.map((node) => {
              if (node.type === 'worklogs' && typeof node.data.people === 'string') {
                return { ...node, data: { ...node.data, people: toChoice(node.data.people) } };
              }
              if (node.type === 'issues' && typeof node.data.assignee === 'string') {
                return { ...node, data: { ...node.data, assignee: toChoice(node.data.assignee) } };
              }
              return node;
            }),
          }));
        }
        // v2: sem período do dashboard; cada peça de dados tinha o seu.
        if (version < 3) state.dashboards = state.dashboards.map(withDashboardPeriod);
        return state;
      },
      partialize: (state): PersistedBuilder => ({
        dashboards: state.dashboards.map((dashboard) => ({
          ...dashboard,
          nodes: dashboard.nodes.map(cleanNode),
          edges: dashboard.edges.map(cleanEdge),
        })),
        activeId: state.activeId,
        mode: state.mode,
        seeded: state.seeded,
        inspectorWidth: state.inspectorWidth,
      }),
    },
  ),
);

function subscribeToHydration(onChange: () => void) {
  return useBuilderStore.persist.onFinishHydration(onChange);
}

/** `true` quando os dashboards salvos já foram lidos do IndexedDB. */
export function useBuilderStoreHydrated(): boolean {
  return useSyncExternalStore(subscribeToHydration, () => useBuilderStore.persist.hasHydrated());
}

/** O dashboard aberto (ou o primeiro, se o aberto foi apagado). */
export function useActiveDashboard(): Dashboard | undefined {
  return useBuilderStore((state) => {
    const activeId = activeIdOf(state);
    return state.dashboards.find((dashboard) => dashboard.id === activeId);
  });
}
