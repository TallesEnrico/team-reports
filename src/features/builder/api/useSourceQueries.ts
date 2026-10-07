import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { useRef } from 'react';
import { JiraApiError } from '../../../api/jira-client';
import { retryUnlessClientError } from '../../../api/retryPolicy';
import { useIsJiraConnected } from '../../../store/useJiraConnectionStore';
import type { SourceData, SourceState } from '../lib/evaluate';
import { fetchIssuesSource, fetchWorklogsSource, type IssuesQuery, type WorklogsQuery } from './builder-api';
import { builderKeys } from './queryKeys';

/** O que cada peça de dados pede ao Jira, ou por que ela ainda não pode buscar. */
export type SourceRequest =
  | { nodeId: string; kind: 'worklogs'; query: WorklogsQuery }
  | { nodeId: string; kind: 'issues'; query: IssuesQuery }
  | { nodeId: string; kind: 'idle'; message: string };

type Fetchable = Exclude<SourceRequest, { kind: 'idle' }>;

function errorMessage(error: Error): string {
  return error instanceof JiraApiError ? error.messages.join(' ') : error.message;
}

function keyOf(request: Fetchable) {
  return request.kind === 'worklogs' ? builderKeys.worklogs(request.query) : builderKeys.issues(request.query);
}

interface SourceQueryResult {
  data: SourceData | undefined;
  error: Error | null;
  isFetching: boolean;
}

// Fora do componente: o resultado só muda quando alguma busca muda.
function combine(results: UseQueryResult<SourceData>[]): SourceQueryResult[] {
  return results.map(({ data, error, isFetching }) => ({ data, error, isFetching }));
}

/**
 * Uma busca por pedido diferente: peças de dados iguais (mesmo período,
 * projetos e pessoas) dividem a mesma busca.
 */
export function useSourceQueries(requests: SourceRequest[]) {
  const isConnected = useIsJiraConnected();
  const fetchable = requests.filter((request): request is Fetchable => request.kind !== 'idle');

  // Pedidos repetidos viram uma busca só (o useQueries não aceita a mesma chave duas vezes).
  const unique = new Map<string, Fetchable>();
  for (const request of fetchable) {
    const hash = JSON.stringify(keyOf(request));
    if (!unique.has(hash)) unique.set(hash, request);
  }
  const hashes = [...unique.keys()];

  const results = useQueries({
    queries: [...unique.values()].map((request) =>
      request.kind === 'worklogs'
        ? {
            queryKey: keyOf(request),
            queryFn: ({ signal }: { signal: AbortSignal }) => fetchWorklogsSource(request.query, signal),
            enabled: isConnected,
            staleTime: 5 * 60_000,
            gcTime: 30 * 60_000,
            retry: retryUnlessClientError,
          }
        : {
            queryKey: keyOf(request),
            queryFn: ({ signal }: { signal: AbortSignal }) => fetchIssuesSource(request.query, signal),
            enabled: isConnected,
            staleTime: 2 * 60_000,
            gcTime: 30 * 60_000,
            retry: retryUnlessClientError,
          },
    ),
    combine,
  });

  // Os últimos dados de cada peça: buscando de novo (ex: outro período), eles ficam na tela, marcados, até os novos chegarem.
  const lastData = useRef(new Map<string, SourceData>());

  // Recriado a cada render: a avaliação das peças compara os dados pela referência, não o objeto do estado.
  const states: Record<string, SourceState> = {};
  for (const request of fetchable) {
    const result = results[hashes.indexOf(JSON.stringify(keyOf(request)))];
    const previous = lastData.current.get(request.nodeId);
    if (result?.data) {
      states[request.nodeId] = { status: 'success', data: result.data };
      lastData.current.set(request.nodeId, result.data);
    } else if (result?.error) {
      states[request.nodeId] = { status: 'error', message: errorMessage(result.error) };
    } else if (previous) {
      states[request.nodeId] = { status: 'success', data: previous, isStale: true };
    } else {
      states[request.nodeId] = { status: 'loading' };
    }
  }
  // Peça sem busca (apagada, ou parada esperando configuração): os dados antigos não voltam depois.
  for (const nodeId of lastData.current.keys()) {
    if (!fetchable.some((request) => request.nodeId === nodeId)) lastData.current.delete(nodeId);
  }
  for (const request of requests) {
    if (request.kind === 'idle') states[request.nodeId] = { status: 'idle', message: request.message };
  }

  return {
    states,
    isFetching: results.some((result) => result.isFetching),
    /** Erro de uma busca que já tinha dados (ex: ao atualizar): os dados antigos continuam na tela. */
    refreshError: results.find((result) => result.data && result.error)?.error ?? null,
  };
}
