import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef } from 'react';
import { useCurrentUserQuery } from '../../../api/useCurrentUserQuery';
import { type DateKey, diffInDays, todayKey } from '../../../lib/dates';
import { defaultReportTimeZone } from '../../../lib/timeZones';
import { useIsJiraConnected, useJiraConnectionStore } from '../../../store/useJiraConnectionStore';
import type { PeopleQuery } from '../api/builder-api';
import { builderKeys } from '../api/queryKeys';
import { type SourceRequest, useSourceQueries } from '../api/useSourceQueries';
import { isSourceKind } from '../lib/catalog';
import { createEvaluator } from '../lib/evaluate';
import { MAX_PERIOD_DAYS, resolvePeriod } from '../lib/periods';
import type {
  BuilderEdge,
  BuilderNode,
  DateRange,
  IssuesConfig,
  PeopleChoice,
  PeriodConfig,
  PieceResult,
  ProjectChoice,
  WorklogsConfig,
} from '../types';

/** Datas e horários no fuso do navegador, entre os aceitos pelo app (como no Kanban e no Metrics). */
export const BUILDER_TIME_ZONE = defaultReportTimeZone();

interface RequestContext {
  today: DateKey;
  /** O período do dashboard, para as peças que o seguem. */
  dashboardPeriod: PeriodConfig;
  connectedSquad: string | undefined;
  accountId: string | undefined;
}

function resolveProjects(projectKeys: ProjectChoice, connectedSquad: string | undefined): string[] {
  if (projectKeys !== null) return projectKeys;
  return connectedSquad ? [connectedSquad] : [];
}

/** De quem são os dados pedidos, ou por que a peça ainda não pode buscar. */
function resolvePeople(choice: PeopleChoice, context: RequestContext): PeopleQuery | { idle: string } {
  if (choice.mode === 'chosen' && choice.accountIds.length === 0) return { idle: 'Escolha as pessoas em "De quem".' };
  // A conta conectada só é conhecida depois da primeira busca do usuário atual.
  if (choice.mode === 'me' && !context.accountId) return { idle: 'Identificando a conta conectada…' };
  return { mode: choice.mode, accountIds: choice.mode === 'chosen' ? [...choice.accountIds].sort() : [] };
}

/** O período resolvido, ou por que ele ainda não vale. */
function checkPeriod(period: DateRange | null | undefined): string | undefined {
  if (period === null) return 'Escolha as datas do período (a primeira antes da segunda).';
  if (period && diffInDays(period.from, period.to) >= MAX_PERIOD_DAYS) return 'Escolha um período de até um ano.';
  return undefined;
}

function worklogsRequest(nodeId: string, config: WorklogsConfig, context: RequestContext): SourceRequest {
  const period = resolvePeriod(config.period, context.today, context.dashboardPeriod);
  const periodProblem = checkPeriod(period);
  if (periodProblem || !period) return { nodeId, kind: 'idle', message: periodProblem ?? '' };
  const people = resolvePeople(config.people, context);
  if ('idle' in people) return { nodeId, kind: 'idle', message: people.idle };
  return {
    nodeId,
    kind: 'worklogs',
    query: {
      projectKeys: resolveProjects(config.projectKeys, context.connectedSquad),
      people,
      accountId: people.mode === 'me' ? context.accountId : undefined,
      from: period.from,
      to: period.to,
      jql: config.jql.trim(),
      timeZone: BUILDER_TIME_ZONE,
    },
  };
}

function issuesRequest(nodeId: string, config: IssuesConfig, context: RequestContext): SourceRequest {
  const period =
    config.selection === 'open' ? undefined : resolvePeriod(config.period, context.today, context.dashboardPeriod);
  const periodProblem = checkPeriod(period);
  if (periodProblem) return { nodeId, kind: 'idle', message: periodProblem };
  const people = resolvePeople(config.assignee, context);
  if ('idle' in people) return { nodeId, kind: 'idle', message: people.idle };
  return {
    nodeId,
    kind: 'issues',
    query: {
      projectKeys: resolveProjects(config.projectKeys, context.connectedSquad),
      selection: config.selection,
      from: period?.from,
      to: period?.to,
      people,
      jql: config.jql.trim(),
      timeZone: BUILDER_TIME_ZONE,
    },
  };
}

/**
 * O que sai de cada peça do dashboard: busca o que as peças de dados pedem e
 * segue as ligações até as visualizações. Peças de dados iguais dividem a busca.
 */
export function useBuilderResults(nodes: BuilderNode[], edges: BuilderEdge[], dashboardPeriod: PeriodConfig) {
  const today = todayKey(BUILDER_TIME_ZONE);
  const connectedSquad = useJiraConnectionStore((state) => state.credentials?.squad);
  const accountId = useCurrentUserQuery().data?.accountId;
  const isConnected = useIsJiraConnected();

  // Só a configuração das peças de dados importa para as buscas: mover peças não recria os pedidos.
  const sourceSignature = nodes
    .filter((node) => isSourceKind(node.type))
    .map((node) => `${node.id}:${node.type}:${JSON.stringify(node.data)}`)
    .join('|');
  const requests = useMemo(() => {
    const context = { today, connectedSquad, accountId, dashboardPeriod };
    return nodes.flatMap((node): SourceRequest[] => {
      if (!isSourceKind(node.type)) return [];
      if (!isConnected) return [{ nodeId: node.id, kind: 'idle', message: 'Conecte a conta do Jira para buscar os dados.' }];
      if (node.type === 'worklogs') return [worklogsRequest(node.id, node.data, context)];
      if (node.type === 'issues') return [issuesRequest(node.id, node.data, context)];
      return [];
    });
    // `nodes` entra pela assinatura (a lista muda a cada arrasto); o período do dashboard, pelas datas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSignature, today, connectedSquad, accountId, isConnected, dashboardPeriod.preset, dashboardPeriod.from, dashboardPeriod.to]);

  const sources = useSourceQueries(requests);

  const evaluatorRef = useRef<ReturnType<typeof createEvaluator>>(null);
  evaluatorRef.current ??= createEvaluator();
  const results: Record<string, PieceResult> = evaluatorRef.current(nodes, edges, sources.states);

  const queryClient = useQueryClient();
  const refresh = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: builderKeys.worklogsRoot() }),
        queryClient.invalidateQueries({ queryKey: builderKeys.issuesRoot() }),
      ]),
    [queryClient],
  );

  return {
    results,
    isFetching: sources.isFetching,
    refreshError: sources.refreshError,
    refresh,
    connectedSquad,
  };
}
