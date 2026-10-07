import type { IssueTypeOption } from '../api/jira-issues';
import { normalizeName } from './subtaskDraft';

/**
 * Nomes de história no Jira (sem acento e sem maiúsculas). Tarefa e bug ficam
 * de fora: o botão cria história, que é a issue pai das subtarefas.
 */
const PARENT_STORY_NAMES = new Set(['historia', 'story', 'user story', 'historia de usuario']);

/**
 * História de nível pai (hierarquia 0, não subtarefa e não épico). O createmeta
 * só devolve os tipos que a conta pode criar: sem este tipo, a conta não cria história.
 */
export function isParentStoryType(type: Pick<IssueTypeOption, 'name' | 'hierarchyLevel'>): boolean {
  return type.hierarchyLevel === 0 && PARENT_STORY_NAMES.has(normalizeName(type.name));
}
