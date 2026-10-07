// Issues, usuários e apontamentos são compartilhados com as outras telas (src/api).
import type { JiraIssue } from '../../api/jira-issues';
import type { JiraUser } from '../../api/jira-users';
import type { WorklogEntry } from '../../api/jira-worklogs';

export type { JiraIssue, JiraUser, WorklogEntry };

/** Mês de calendário, `YYYY-MM`. */
export type MonthKey = string;

/** Issue com apontamento no mês, com o projeto dela (a squad ou outro). */
export interface MetricsIssue extends JiraIssue {
  projectKey: string;
  projectName: string;
}

/**
 * Apontamentos de um mês, com um dia de folga para cada lado (o corte exato é
 * feito no fuso da tela). `worklogs` tem o formato dos relatórios de horas:
 * editar um apontamento no Reports troca ele aqui também.
 */
export interface MonthWorklogs {
  issues: MetricsIssue[];
  worklogs: WorklogEntry[];
  /** Quem lançou cada apontamento, pelo accountId. */
  authors: Record<string, JiraUser>;
}

/**
 * Faixas das horas de um dia útil, em segundos: abaixo de `danger`, vermelho; de
 * `danger` até abaixo de `alert`, amarelo; de `alert` até `success` (a jornada,
 * que é o esperado por dia útil), verde; acima, azul. Sempre `danger <= alert <= success`.
 */
export interface DayRanges {
  danger: number;
  alert: number;
  success: number;
}

/** Quantos meses entram na comparação, contando o mês escolhido. */
export type CompareMonths = 1 | 3 | 6 | 12;

/** `squad`: só as horas lançadas em issues da squad. */
export type HoursScope = 'all' | 'squad';

/** Recortes da lista de pessoas. */
export type PersonFilter = 'all' | 'missed-last-workday' | 'missing-days' | 'below-target' | 'no-hours';

export type PeopleSortKey = 'name' | 'hours' | 'coverage' | 'missing' | 'last';

export interface PeopleSort {
  key: PeopleSortKey;
  direction: 'asc' | 'desc';
}
