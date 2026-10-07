import type { ChatAnswer, ChatMessage } from '../api/openrouter';
import type { CreateFieldOption } from '../api/jira-issues';
import { extractJson } from './extractJson';
import { type ActivityFields, activityOptions, normalizeEstimate, normalizeName } from './subtaskDraft';

/** O que a IA lê para sugerir as subtarefas: a história e as opções de atividade do Jira. */
export interface SubtaskContext {
  parentKey: string;
  parentType: string;
  summary: string;
  /** Descrição da história em texto simples. */
  description: string;
  /** Estimativa original da história, já formatada ("16h"); vazia sem estimativa. */
  estimate: string;
  /** Títulos das filhas que já existem (para não repetir). */
  existing: string[];
  activity: ActivityFields;
  /** Os tipos de atividade que a pessoa escolheu antes de pedir: as subtarefas ficam só neles. */
  chosenTypes: CreateFieldOption[];
  /** Orientação a mais da pessoa ("foque em testes"). */
  guidance?: string;
}

/** Uma subtarefa sugerida, com as opções de atividade já casadas com os ids do Jira. */
export interface SubtaskSuggestion {
  summary: string;
  description: string;
  estimate: string;
  activityTypeId: string;
  activityId: string;
}

export class AiSubtasksError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiSubtasksError';
  }
}

const MAX_DESCRIPTION = 8000;
const MAX_SUGGESTIONS = 10;

const SYSTEM_PROMPT = `Você ajuda o time a quebrar uma história do Jira em subtarefas. Responda SÓ com um objeto JSON, sem texto fora dele, neste formato:
{"subtasks": [{"summary": "...", "description": "...", "estimate": "3h 30m", "activityType": "...", "activity": "..."}]}

Regras:
- De 2 a 8 subtarefas, na ordem em que o trabalho acontece, cobrindo o que a história pede (e só isso).
- Cada subtarefa é uma entrega concreta e verificável, de 30m a 8h. Quebre o que passar de um dia.
- summary: curto (até 80 caracteres), em português, começando com um verbo no infinitivo (ex: "Criar o endpoint de cadastro").
- description: texto simples, em português, de 2 a 5 linhas: o que fazer e, numa última linha "Pronto quando: ...", o critério de pronto.
- estimate: no formato do Jira, em horas e minutos (ex: "2h", "3h 30m", "45m").
- Se a história tem estimativa, a soma das subtarefas deve ficar perto dela.
- Não repita as subtarefas que já existem.
- activityType: só um dos tipos de atividade escolhidos pela pessoa, copiado exatamente. Crie subtarefas para cada tipo escolhido que a história pede (um tipo pode ter várias subtarefas) e nenhuma fora deles.
- activity: copie exatamente uma das atividades dadas, a que melhor descreve a subtarefa; quando as atividades vêm agrupadas por tipo, uma do activityType da subtarefa. Sem lista, use "".
- Não invente pessoas, prazos ou requisitos que a história não tem.`;

const optionNames = (options: CreateFieldOption[]) => options.map((option) => option.value);

/** Os tipos escolhidos (ou todos, sem escolha). */
function typeCandidates(activity: ActivityFields, chosenTypes: CreateFieldOption[]): CreateFieldOption[] {
  return chosenTypes.length > 0 ? chosenTypes : (activity.type?.options ?? []);
}

/** As opções como a IA lê: os tipos de atividade escolhidos e as atividades (na cascata, as de cada tipo escolhido). */
function activityLines(activity: ActivityFields, chosenTypes: CreateFieldOption[]): string[] {
  const types = typeCandidates(activity, chosenTypes);
  if (activity.activityFromType) {
    const grouped = Object.fromEntries(types.map((type) => [type.value, optionNames(type.children)]));
    return [`Tipos de atividade escolhidos pela pessoa, com as atividades de cada um (activityType: activity): ${JSON.stringify(grouped)}`];
  }
  const lines: string[] = [];
  if (types.length > 0) lines.push(`Tipos de atividade escolhidos pela pessoa (activityType): ${JSON.stringify(optionNames(types))}`);
  if (activity.activity?.options.length) {
    lines.push(`Atividades (activity): ${JSON.stringify(optionNames(activity.activity.options))}`);
  }
  return lines.length > 0 ? lines : ['Sem listas de tipo de atividade e atividade: use "".'];
}

/** As mensagens do pedido: as regras e a história (sem nomes de pessoas). */
export function buildSubtaskMessages(context: SubtaskContext): ChatMessage[] {
  const description = context.description.trim().slice(0, MAX_DESCRIPTION) || '(sem descrição)';
  const existing = context.existing.length > 0 ? context.existing.map((title) => `- ${title}`).join('\n') : '(nenhuma)';
  const user = [
    `${context.parentType} ${context.parentKey}`,
    `Título: ${context.summary}`,
    `Estimativa da história: ${context.estimate || 'sem estimativa'}`,
    `Descrição:\n<<<\n${description}\n>>>`,
    `Subtarefas que já existem:\n${existing}`,
    ...activityLines(context.activity, context.chosenTypes),
    ...(context.guidance?.trim() ? [`Orientação da pessoa: ${context.guidance.trim()}`] : []),
  ].join('\n\n');
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}

/** Para comparar nomes: sem acento, sem maiúsculas e sem pontuação ("Back-end" = "back end"). */
const matchKey = (value: string) => normalizeName(value).replace(/[^a-z0-9]+/g, ' ').trim();

/** A opção pelo nome que a IA escreveu (igual; senão, a que contém ou está contida). */
function matchOption<Option extends { value: string }>(options: Option[], name: unknown): Option | undefined {
  if (typeof name !== 'string' || !matchKey(name)) return undefined;
  const wanted = matchKey(name);
  return (
    options.find((option) => matchKey(option.value) === wanted) ??
    options.find((option) => matchKey(option.value).includes(wanted) || wanted.includes(matchKey(option.value)))
  );
}

type Raw = Record<string, unknown>;
const isRecord = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/**
 * As sugestões da resposta, com as opções casadas; vazio se nada prestar. O
 * tipo de atividade só vale entre os escolhidos (com um só, ele vale para
 * todas); na cascata, a atividade é do tipo, e uma atividade casada sem o tipo traz o tipo dela.
 */
export function parseSubtaskSuggestions(raw: unknown, activity: ActivityFields, chosenTypes: CreateFieldOption[] = []): SubtaskSuggestion[] {
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw)
      ? ([raw.subtasks, raw.suggestions, raw.subtarefas].find(Array.isArray) as unknown[] | undefined)
      : undefined;
  const types = typeCandidates(activity, chosenTypes);
  return (list ?? [])
    .filter(isRecord)
    .flatMap((item): SubtaskSuggestion[] => {
      const summary = text(item.summary ?? item.title, 255).replace(/\s+/g, ' ');
      if (!summary) return [];
      let type = matchOption(types, item.activityType) ?? (chosenTypes.length === 1 ? chosenTypes[0] : undefined);
      // Na cascata, a atividade certa (de um dos tipos escolhidos) diz o tipo quando a IA não acertou o nome dele.
      if (!type && activity.activityFromType) type = types.find((candidate) => matchOption(candidate.children, item.activity));
      const activityTypeId = type?.id ?? (activity.type?.kind === 'text' ? text(item.activityType, 255) : '');
      const activityId =
        matchOption(activityOptions(activity, activityTypeId), item.activity)?.id ??
        (activity.activity?.kind === 'text' ? text(item.activity, 255) : '');
      return [
        {
          summary,
          description: text(item.description, 4000),
          estimate: normalizeEstimate(text(item.estimate, 40)) ?? '',
          activityTypeId,
          activityId,
        },
      ];
    })
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * Pede as subtarefas à IA. Uma resposta sem nenhuma sugestão aproveitável
 * (JSON quebrado, lista vazia) volta para ela uma vez, com o problema.
 */
export async function generateSubtaskSuggestions(
  context: SubtaskContext,
  complete: (messages: ChatMessage[]) => Promise<ChatAnswer>,
): Promise<{ suggestions: SubtaskSuggestion[]; model: string }> {
  const messages = buildSubtaskMessages(context);
  let problem = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await complete(messages);
    try {
      const suggestions = parseSubtaskSuggestions(extractJson(answer.content), context.activity, context.chosenTypes);
      if (suggestions.length > 0) return { suggestions, model: answer.model };
      problem = 'A resposta não tem nenhuma subtarefa com "summary".';
    } catch {
      problem = 'A resposta não é um JSON válido.';
    }
    messages.push(
      { role: 'assistant', content: answer.content },
      { role: 'user', content: `${problem} Devolva só o objeto JSON {"subtasks": [...]}, no formato pedido.` },
    );
  }
  throw new AiSubtasksError(`A IA não devolveu subtarefas que dê para usar (${problem}). Tente de novo ou escolha outro modelo.`);
}
