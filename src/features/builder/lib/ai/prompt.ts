import type { DateKey } from '../../../../lib/dates';
import type { Dashboard, SourceKind } from '../../types';
import { PIECE_ORDER, PIECES } from '../catalog';
import { ISSUE_SELECTIONS, SORT_ORDERS } from '../describe';
import { DEFAULT_DASHBOARD_PERIOD, PERIOD_OPTIONS } from '../periods';
import { schemaOf } from '../schema';
import { buildTemplate } from '../templates';
import { type AiDashboardSpec, dashboardToSpec, FIXED_FILTER_VALUES, formatSpec } from './spec';

const SOURCE_TITLES: Record<SourceKind, string> = { worklogs: 'worklogs (Horas lançadas)', issues: 'issues (Issues)' };

function list(items: { value: string; label: string }[]): string {
  return items.map((item) => `"${item.value}" (${item.label})`).join(', ');
}

/** Campos e medidas de cada fonte, direto do esquema (o mesmo que o painel da peça mostra). */
function fieldsOf(source: SourceKind): string {
  const schema = schemaOf(source);
  const fields = schema.dimensions.map((dimension) => `${dimension.id} (${dimension.label})`).join(', ');
  const measures = schema.measures.map((measure) => `${measure.id} (${measure.label})`).join(', ');
  return `${SOURCE_TITLES[source]}\n  campos: ${fields}\n  medidas: ${measures}`;
}

const PIECE_CONFIGS: Record<string, string> = {
  worklogs: '{"period": PERIODO_DA_PECA, "squads": SQUADS, "people": PESSOAS, "jql": "opcional"}',
  issues: `{"selection": ${ISSUE_SELECTIONS.map((option) => `"${option.value}"`).join(' | ')}, "period": PERIODO_DA_PECA, "squads": SQUADS, "assignee": PESSOAS, "jql": "opcional"}`,
  filter: '{"field": CAMPO, "mode": "include" | "exclude", "values": [VALORES]}',
  group: '{"by": CAMPO | null, "series": CAMPO | null, "measure": MEDIDA}',
  sort: `{"order": ${SORT_ORDERS.map((option) => `"${option.value}"`).join(' | ')}, "limit": número | null, "others": true | false}`,
  visual: '{"title": "título curto", "width": "quarter" | "third" | "half" | "full", "measure": MEDIDA (só no number ligado a dados sem agrupar)}',
};

function piecesCatalog(): string {
  const lines = PIECE_ORDER.map((kind) => {
    const piece = PIECES[kind];
    const line = `- ${kind}: ${piece.name}. ${piece.description}`;
    return piece.category === 'visual' ? line : `${line}\n  config: ${PIECE_CONFIGS[kind]}`;
  });
  const visuals = PIECE_ORDER.filter((kind) => PIECES[kind].category === 'visual').join(', ');
  return `${lines.join('\n')}\n  config de ${visuals}: ${PIECE_CONFIGS.visual}`;
}

function fixedValues(): string {
  return Object.entries(FIXED_FILTER_VALUES)
    .map(([field, values]) => `  ${field}: ${Object.entries(values).map(([value, label]) => `"${value}" (${label})`).join(', ')}`)
    .join('\n');
}

/** O modelo "Horas da minha squad" no formato da IA: um exemplo que sempre encaixa. */
function example(): string {
  const dashboard: Dashboard = {
    id: 'exemplo',
    name: 'Horas da minha squad',
    period: DEFAULT_DASHBOARD_PERIOD,
    ...buildTemplate('squad-month'),
    updatedAt: 0,
  };
  const { spec } = dashboardToSpec(dashboard);
  return formatSpec(
    spec,
    'Montei os totais da sua squad no mês, as horas por pessoa e por dia, quem lançou em cada dia e as horas por tipo de issue.',
  );
}

/** As instruções da IA: o que é cada peça, como elas encaixam e o formato da resposta. */
export function buildSystemPrompt(today: DateKey): string {
  const periods = list(PERIOD_OPTIONS.filter((option) => option.value !== 'custom'));
  return `Você monta dashboards no Dashboard, a ferramenta de gestão do Time que mostra as horas lançadas e as issues do Jira de todas as squads (cada squad é um projeto do Jira). Um dashboard é uma montagem de peças encaixadas: as peças de dados buscam no Jira, as de transformar filtram, agrupam e ordenam, e as de mostrar viram os blocos do dashboard. Hoje é ${today}.

Responda SÓ com um objeto JSON (sem texto fora dele, sem comentários), neste formato:
{"name": "nome curto do dashboard (até 60 caracteres)", "period": PERIODO, "summary": "uma ou duas frases, em português, dizendo o que você montou ou mudou e o que a pessoa ainda precisa escolher", "pieces": [{"id": "id curto e único", "type": TIPO, "input": "id da peça que alimenta esta", "config": {...}}]}

## Peças (TIPO)
${piecesCatalog()}

## Valores
- PERIODO (do dashboard): ${periods}, ou {"from": "AAAA-MM-DD", "to": "AAAA-MM-DD"} (até 366 dias).
- PERIODO_DA_PECA: "dashboard" (segue o período do dashboard; use quase sempre) ou um PERIODO próprio, quando a peça precisa de outro período que o resto.
- SQUADS: "all" (todas as squads, o padrão), "mine" (a squad da pessoa que está usando) ou uma lista com as chaves de projeto que a pessoa citou no pedido (ex: ["CLI"]).
- PESSOAS: "all" (todas, o padrão) ou "me" (só a pessoa que está usando).
- jql: só se o pedido precisar de um critério que as peças não têm (ex: "labels = backend"); sem ORDER BY.
- "ref:N": uma escolha da pessoa que você não vê (squads ou pessoas escolhidas, JQL, valores de filtro). Copie como está nas peças que continuam; nunca invente um ref.

## Campos (CAMPO) e medidas (MEDIDA) de cada fonte
${fieldsOf('worklogs')}
${fieldsOf('issues')}
"personSquad" é a squad em que a pessoa mais lançou horas; "project" é a squad da issue.

VALORES de filtro que você pode usar:
${fixedValues()}
  type e status: o nome exato no Jira (ex: "Bug"), só se a pessoa citar.
  Para person, project, personSquad, issue, parent, assignee e priority você não conhece os valores: use "values": [] (a pessoa escolhe no painel da peça) e diga isso no summary.

## Regras de encaixe
- Toda peça, menos as de dados (worklogs, issues), tem exatamente um "input": o id de uma peça anterior que tem saída. Peças de dados não têm input. Uma saída alimenta quantas peças quiser: reaproveite a mesma peça de dados em vez de repetir.
- worklogs e issues soltam registros. filter solta o mesmo formato que recebe. group e sort soltam dados agrupados.
- group só recebe registros (direto da peça de dados ou de um filter ligado a ela). sort só recebe dados agrupados.
- bars, columns e heatmap precisam de dados agrupados (um group antes; pode ter sort ou filter no meio). heatmap precisa de um group com "by" e "series". columns é para tempo (by: day, week, month, createdWeek…).
- number e table aceitam registros ou agrupados. number em registros mostra a "measure" dele; em agrupados, o total.
- Os campos e medidas têm que existir na fonte da cadeia (ex: "person" é de worklogs; em issues, use "assignee").
- Os blocos aparecem no dashboard na ordem em que as peças de mostrar estão em "pieces": os números primeiro, depois os gráficos e as tabelas.
- A linha do dashboard tem 12 colunas: quarter = 3, third = 4, half = 6, full = 12. number: quarter ou third; bars e columns: half ou full; heatmap e table: full. Feche as linhas (ex: 4 números quarter, 2 gráficos half).
- Títulos curtos, em português, dizendo o que o bloco mostra.

## Receitas (adapte ao pedido)
- Quem não está lançando horas: worklogs; os números "people", "days" e "average"; heatmap com group person × day (os dias sem horas ficam vazios); bars das horas por pessoa com sort "value-asc". Quem não lançou nada no período só aparece (zerado) se for escolhido em "people"; com "all", só aparece quem lançou. No summary, diga que, para ver quem não lançou nada, a pessoa deve escolher as pessoas da equipe na peça de horas.
- Comparar pessoas: bars com group person × week (ou × project, × type), width full; ou heatmap person × week. Repetir um gráfico que já existe só mudando a ordem não é comparar.
- Comparar squads: bars com group project × week, ou columns com group week × project.
- Evolução no tempo: columns com group day, week ou month (em issues, createdWeek ou doneWeek).
- Estouro de estimativa: issues "open", o number "overCount" e um filter estimate = "over" ligado a uma table.
- "Da minha squad", "do meu time": squads "mine". "Minhas horas": people "me".

## Editando um dashboard
Quando a mensagem trouxer o dashboard atual, devolva o dashboard INTEIRO já com a mudança: mantenha os ids, as configurações e a ordem das peças que continuam, e o nome e o período, a não ser que o pedido peça outra coisa.

## Exemplo (pedido: "horas da minha squad no mês")
${example()}`;
}

/** A mensagem com o pedido (e, ao editar, o dashboard atual no formato da IA). */
export function buildUserMessage(prompt: string, current?: AiDashboardSpec): string {
  if (!current) return `Monte um dashboard novo para este pedido:\n${prompt}`;
  return `Dashboard atual:\n${formatSpec(current)}\n\nMude o dashboard atual conforme este pedido e devolva ele inteiro:\n${prompt}`;
}

/** Segunda tentativa: os erros da resposta anterior, para a IA corrigir. */
export function buildFixMessage(errors: string[]): string {
  return `A resposta tem erros. Corrija e devolva o JSON inteiro de novo, só o JSON:\n${errors.map((error) => `- ${error}`).join('\n')}`;
}
