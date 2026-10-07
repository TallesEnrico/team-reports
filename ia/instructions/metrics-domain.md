# Domínio: Metrics

Indicadores de horas de uma ou mais squads no mês, contra a jornada esperada: quem está sem lançar, cobertura por pessoa, horas por dia, projeto e issue, e a comparação com os meses anteriores. Fica em `/#/metrics` (`src/features/metrics`), com a mesma lateral e o mesmo modal da issue das outras telas (rotas e layout: ver `kanban-domain.md`). Só leitura: não lança nem edita horas (isso fica no modal da issue e no Reports).

## Equipe e horas

- **Squads:** uma ou mais, no multiselect "Squads" da lateral (`SquadMultiSelect`, em `src/components`, com as mesmas opções do `SquadSelect` do Kanban). Sem escolha salva, vale a squad da conta conectada (escolher só ela salva o "padrão": se a squad da conta mudar, a tela acompanha). Dá para tirar todas (fica salvo como "nenhuma", `[]`): aí valem só as pessoas escolhidas, com as horas em qualquer projeto, e o seletor "Horas" some. **Sem squad e sem pessoa, nada é buscado** (`isIdle`): a página pede para escolher uma das duas e o painel anterior sai da tela. Squads salvas que a conta conectada não enxerga saem; sem nenhuma visível, volta a squad da conta. Nos textos abaixo, "a squad" vale para todas as escolhidas.
- **Equipe:** as pessoas escolhidas em "Pessoas" ou, sem escolha, quem lançou horas em issues da squad em algum dos meses comparados. A escolha fica salva por conjunto de squads (`squadsKey`: as chaves em ordem, separadas por vírgula; com uma squad só, é a chave dela). Quem nunca lançou na squad nesse período só entra escolhido. As opções de "Pessoas" (`PeoplePicker`) mostram primeiro quem lançou horas na squad, depois quem pode ser responsável em alguma das squads (`useSquadsMembersQuery`: uma busca por squad, no mesmo cache do `useSquadMembersQuery` do Kanban) e por último o resto do Jira ("Outras pessoas do Jira"). Sem squad, a lista é a de todas as pessoas do Jira. As pessoas do Jira vêm de `GET /rest/api/3/users/search` (`useAllUsersQuery`, paginado até uma página vazia, só contas de pessoas ativas, 30 min de cache). Nome e foto de quem foi escolhido ficam salvos (`knownPeople`), porque quem veio de fora da squad e ainda não lançou horas não aparece em outra lista.
- **"Todas as pessoas"**, no topo de "Pessoas", é uma escolha só (salva como `'all'`): com squad, quem lançou horas nela e quem pode ser responsável nela, mesmo sem horas ("Todas as pessoas da squad"); sem squad, todas as pessoas do Jira, com as horas em qualquer projeto ("Todas as pessoas do Jira"). Escolhê-la tira as pessoas escolhidas; escolher uma pessoa com ela ativa fica só com a pessoa.
- **Pessoa = conta do Jira** (`accountId`): nome e foto vêm da conta. A mesma pessoa com duas contas (ex: uma antiga, de outro e-mail) aparece duas vezes. No modal da pessoa, "Contas no Jira" junta as contas (`mergedAccounts` na store, salvo e valendo para todas as squads; "Separar" desfaz): as horas das duas contam como de uma pessoa só, com o nome e a foto da conta principal, e a busca dos outros projetos inclui as contas juntadas. Quem tem o mesmo primeiro nome de outra pessoa da lista ganha uma sugestão de junção no topo do modal (só sugestão; nada é juntado sozinho). Cada conta tem o link para o perfil no Jira, para conferir.
- **Contas desativadas** no Jira (`active: false` no autor do apontamento) só entram na equipe sem escolha se tiverem horas no mês: sem isso apareceriam como "sem lançar" para sempre. Juntadas a outra conta, continuam contando nela.
- **Horas:** por padrão, as da equipe em qualquer projeto (ex: reuniões num projeto à parte, como o ECHO); "Horas: só nas issues da squad" corta o resto. Apontamentos de quem não é da equipe não entram.
- **Busca por mês**, em duas etapas, cada mês numa query própria (trocar o mês ou o período reaproveita os meses em cache):
  1. `project in (SQUADS) AND worklogDate` no mês: as horas das squads, de qualquer pessoa, e quem as lançou (a equipe, sem escolha).
  2. `worklogAuthor in (equipe) AND project not in (SQUADS) AND worklogDate` no mês: as horas da equipe nos outros projetos. Só roda com a equipe definida (sem escolha, depois de todos os meses da etapa 1) e com "Horas" em qualquer projeto. A JQL vai na URL (GET), então a equipe é dividida em buscas de 40 pessoas.
  - Sem squad, só a etapa 2, sem o `project not in`: as horas das pessoas escolhidas em qualquer projeto. Em "Horas por projeto", nenhum projeto fica em destaque.
- As datas da JQL têm um dia de folga para cada lado (o Jira avalia `worklogDate` no fuso do dono do token); o corte exato do mês e dos dias é feito no navegador, no fuso da tela (o do navegador, entre os aceitos pelo app, como no Kanban). Issues com mais de 20 apontamentos buscam os do mês em `GET .../issue/{id}/worklog` com `startedAfter`/`startedBefore`.
- Todas as requisições da tela passam por uma fila com até 6 simultâneas (`lib/requestQueue.ts`), com o mês escolhido antes dos anteriores. O `requestJira` repete leituras recusadas com 429 (até 3 vezes, respeitando `Retry-After`).
- Os meses ficam sob `jiraKeys.worklogReports()`, com `worklogs` no formato dos relatórios: lançar horas em qualquer tela busca de novo os meses na tela, e editar um apontamento no Reports troca ele aqui. Mês corrente: 5 min de cache; anteriores: 30 min.

## Jornada e dias úteis

- **Dia útil:** segunda a sexta, fora dos feriados nacionais (inclusive a Sexta-feira Santa) e dos pontos facultativos que costumam parar o trabalho (Carnaval, Corpus Christi), calculados em `src/lib/holidays.ts` (Páscoa pelo algoritmo de Meeus). Feriados estaduais e municipais, férias e folgas não entram: a lateral diz isso.
- **Jornada e faixas do dia** (`DayRanges`, em `lib/dayRanges.ts`): três limites escolhidos na lateral ("Jornada"), de meia em meia hora até 12h, os mesmos para toda a equipe: `danger` (vermelho abaixo de; padrão 4h), `alert` (amarelo abaixo de; padrão 4h, o mesmo do vermelho, então sem faixa amarela) e `success` (verde até, que é a jornada: o esperado por dia útil; padrão 8h). Sempre `danger <= alert <= success`: mudar um limite empurra os outros. Com o amarelo igual ao vermelho, a faixa amarela some das legendas e a lateral avisa.
- **Esperado:** jornada × dias úteis que já terminaram (antes de hoje) × pessoas. Hoje e os dias seguintes não contam; o mês corrente é comparado pelo que já passou. Horas em fim de semana e feriado contam no lançado, sem esperado.
- **Cobertura:** lançado / esperado. Sem dia útil terminado no mês, não há cobertura nem os recortes de "sem lançar".
- **Situação de cada dia** (`dayStatus`), pelas faixas:
  - sem horas num dia útil que já terminou: cinza (`missing`);
  - mais que 0 e menos que `danger`: vermelho (`danger`);
  - de `danger` até menos que `alert`: amarelo (`alert`);
  - de `alert` até `success` (inclusive): verde (`success`);
  - mais que `success`: azul (`over`);
  - fim de semana e feriado (`off`): sem jornada; as horas que houver aparecem em azul (são todas a mais);
  - hoje e adiante abaixo do verde (`pending`): ainda não terminou, sem cor de faixa.

## Mês e comparação

- Sem escolha, abre o mês do último dia útil que já terminou: no dia 1º (ou antes do primeiro dia útil do mês) abre o mês anterior, que é o que dá para cobrar. A escolha do mês vale só na sessão; o mês padrão fica salvo como "padrão" e acompanha a virada do mês. Meses futuros não são oferecidos.
- "Comparar": últimos 3 (padrão), 6 ou 12 meses, contando o escolhido. A tela aparece com o mês escolhido carregado; os anteriores entram aos poucos ("Carregando N meses anteriores…").
- Trocar o mês, a squad ou as pessoas mantém o painel anterior na tela, esmaecido, com "Atualizando…" preso no topo, até o novo chegar. Sem conta conectada, nada fica na tela.

## Tela

- **Resumo:** horas lançadas (contra o esperado), cobertura com a variação em pontos percentuais contra o mês anterior, pessoas sem lançar no último dia útil, dias úteis sem lançamento (soma de todas as pessoas) e issues trabalhadas. Os cartões de alerta aplicam o recorte na lista de pessoas.
- **Horas por dia:** colunas do mês com o esperado (jornada × pessoas) como linha nos dias úteis; fins de semana e feriados em faixa cinza.
- **Mês a mês:** lançado contra o esperado em cada mês, o escolhido em destaque e os anteriores em cinza, com a cobertura sobre as colunas (até 6 meses; com 12, só sobre o escolhido).
- **Pessoas:** recortes com a contagem (todas, sem lançar no último dia útil, com dias sem lançamento, abaixo de 90% da jornada, sem horas no mês) e a tabela ordenável: lançado, cobertura, dias sem lançar, último lançamento (nos meses carregados), os dias do mês (cada dia é uma colunazinha: a altura é a fração da jornada e a cor, a faixa do dia; a legenda mostra as horas de cada faixa) e o mês a mês. O recorte vale só na sessão; a ordenação fica salva.
- **Horas por projeto** (as squads em destaque, os outros em cinza; depois de 7, "Outros N projetos") e **Issues com mais horas** (as 10 maiores, com quantas pessoas lançaram).
- Clique numa pessoa (ou num dia dela) abre o modal da pessoa: os números do mês, os dias (como no relatório antigo: um ponto com a cor da faixa de cada dia), os apontamentos do dia escolhido (tarefa, descrição, horário, tempo e o total), as issues do mês por projeto (status, horas da pessoa no mês, estimativa, lançado por todos, restante, e o excedente da estimativa em vermelho) e o mês a mês dela.
- A chave de uma issue abre o `IssueDialog` (`/#/metrics?issue=CHAVE`, `useOpenIssue`); aberto a partir do modal da pessoa, fechar a issue volta para ele.
- Todo gráfico tem a visão "Tabela" com os mesmos números, e tooltip no hover e no foco. Gráficos em HTML/CSS (sem biblioteca), com as cores do projeto: azul para a série, cinza (`--text-faint`) para contexto, tinta forte para o esperado; vermelho só para alertas (sempre com ícone ou rótulo) e para a faixa vermelha dos dias. As cores das faixas do dia (vermelho, amarelo, verde, azul; cinza sem horas) valem só para os dias de cada pessoa, sempre com a legenda das horas de cada faixa.
- "Imprimir" usa a impressão do navegador (ou "Salvar como PDF") e sai igual à tela, numa folha A4 deitada, com as cores dos gráficos (ver "Impressão" em `kanban-domain.md`): a lateral, os botões e a troca gráfico/tabela somem. As linhas do painel seguem a largura dele (container query `metrics`: uma coluna até 840 px, a largura numa janela de 1200 px com a lateral no padrão), então o papel tem as mesmas colunas da tela.

## Escopos

- Basta `read:jira-work` (busca e apontamentos). `read:jira-user` só alimenta as opções de "Pessoas" (as da squad e as do Jira; a lista do Jira pede também a permissão "Navegar por usuários e grupos" no site); sem ele, a lateral avisa e a equipe continua vindo de quem lançou horas na squad.
