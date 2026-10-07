interface QueuedTask {
  priority: number;
  order: number;
  start: () => void;
}

/**
 * Fila com limite de requisições simultâneas, compartilhada por todas as
 * buscas de uma tela: vários meses carregam ao mesmo tempo sem estourar o
 * limite de requisições do Jira. Prioridade menor sai primeiro (ex: o mês
 * escolhido antes dos meses da comparação); empate, na ordem de chegada.
 */
export function createRequestQueue(concurrency: number) {
  const pending: QueuedTask[] = [];
  let active = 0;
  let arrivals = 0;

  function next() {
    while (active < concurrency && pending.length > 0) {
      pending.sort((a, b) => a.priority - b.priority || a.order - b.order);
      const task = pending.shift()!;
      active++;
      task.start();
    }
  }

  return function enqueue<T>(priority: number, task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      pending.push({
        priority,
        order: arrivals++,
        start: () => {
          task()
            .then(resolve, reject)
            .finally(() => {
              active--;
              next();
            });
        },
      });
      next();
    });
  };
}
