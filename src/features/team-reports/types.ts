import type { JiraProject } from '../../api/jira-projects';
import type { JiraUser } from '../../api/jira-users';
import type { WorklogEntry } from '../../api/jira-worklogs';
import type { DateKey } from '../../lib/dates';
import type { TimeFormat } from '../../lib/formatDuration';
import type { ReportTimeZone } from '../../lib/timeZones';

// ---------- Filtros (painel esquerdo) ----------

export type Principal =
  | { type: 'current-user' }
  | { type: 'user'; accountId: string; displayName: string; avatarUrl?: string }
  | { type: 'group'; groupId: string; name: string };

export interface ReportFilters {
  from: DateKey;
  to: DateKey;
  projectKeys: string[];
  /** Vazio = apontamentos de qualquer pessoa. */
  principals: Principal[];
  additionalFieldIds: string[];
  jql: string;
}

// ---------- Configuração do relatório (topo) ----------

export type GroupBy = 'issue' | 'parent' | 'user' | 'project';
export type PeriodGrouping = 'day' | 'week' | 'month';

export interface ReportDisplay {
  groupBy: GroupBy;
  period: PeriodGrouping;
  timeFormat: TimeFormat;
  timeZone: ReportTimeZone;
}

// ---------- Dados vindos do Jira, já normalizados ----------

// Usuários, projetos e apontamentos são compartilhados com as outras telas (src/api).
export type { JiraProject, JiraUser, WorklogEntry };

export interface JiraField {
  id: string;
  name: string;
  schemaType?: string;
  custom: boolean;
}

export interface JiraGroup {
  groupId: string;
  name: string;
}

export interface ReportIssue {
  id: string;
  key: string;
  summary: string;
  projectKey: string;
  projectName: string;
  issueType?: { name: string; iconUrl?: string };
  /** A issue pai (o id e o ícone abrem o modal dela pela linha do grupo). */
  parent?: { id: string; key: string; summary: string; iconUrl?: string };
  /** `categoryKey`: 'new' (a fazer), 'indeterminate' (em andamento) ou 'done' (concluído). */
  status?: { name: string; categoryKey?: string };
  /** Responsável: agrupa a issue em andamento sem apontamento no período. */
  assignee?: JiraUser;
  /** Campos crus pedidos em "Additional Fields". */
  fields: Record<string, unknown>;
}

export interface WorklogReport {
  /** Filtros com que os dados foram buscados (podem diferir dos aplicados enquanto um refetch roda). */
  filters: ReportFilters;
  jql: string;
  issues: ReportIssue[];
  worklogs: WorklogEntry[];
  authors: Record<string, JiraUser>;
}
