---
name: team-reports-domain
description: "Use when working on the Team-Reports feature: fetching Jira issue/worklog data via the Jira REST API, building report filters (date range, projects, users, JQL), or rendering the grouped time-tracking table. Trigger phrases: Team-Reports, time report, worklog, Jira API, JQL filter."
---

# Domínio: Team-Reports

Recriação de um relatório de apontamento de horas (time tracking) baseado em issues do Jira, agrupado por dia.

## Arquitetura: frontend + proxy de escritas

O build é estático e o navegador chama a API do Jira direto. A única peça fora do navegador é o **proxy de escritas** (`proxy/`, um Cloudflare Worker), que existe porque o Jira Cloud recusa POST vindo do navegador (ver "POST não funciona do navegador", abaixo):
- ele só repassa os POST do app (`ALLOWED_PATHS` em `proxy/src/index.ts`: trocar status, lançar horas e criar issues), só para o site do Jira e só para as origens do app (`ALLOWED_ORIGINS`);
- o token de cada pessoa só passa por ele (cabeçalho `Authorization`): nada é guardado nem registrado (logs desligados);
- o app usa o proxy só com `VITE_JIRA_WRITE_PROXY_URL` (`JIRA_WRITE_PROXY_URL` em `src/api/jira-config.ts`); sem ele, os POST vão direto e o Jira os recusa (o lançamento de horas cai para a edição da issue, por PUT).

O mesmo Worker serve também o **servidor MCP**, no caminho `/mcp`, exclusivo dos assistentes de IA (ver `mcp-domain.md`): o app nunca o chama, e as requisições do frontend continuam como descrito aqui.

A IA do Dashboard chama a OpenRouter direto do navegador, com a chave de cada pessoa, sem passar pelo Worker (ver "Criar e editar com IA" em `builder-domain.md`).

Os dashboards também vão de um navegador a outro por WebRTC, sem passar pelo Worker: relays Nostr públicos só apresentam os navegadores, e o resto vai direto entre eles (ver `p2p-domain.md`).

Não adicione outras peças de servidor, não passe leituras ou PUT do app pelo proxy e não guarde nada no Worker. Um POST novo no app precisa entrar em `ALLOWED_PATHS`. Testar e publicar: `proxy/README.md`.

## Fonte de dados

- API: Jira Cloud REST API v3 pelo gateway da Atlassian, `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/...`. O `cloudId` e o domínio do site vêm da conta conectada (o primeiro passo do assistente). Ao abrir, o app lê o subdomínio do endereço (o rótulo antes do domínio do site, como `subdominio.dominio.com.br`, ou `nome.localhost`) ou `?dominio=` — na query de verdade e também dentro do hash (`#/caminho?dominio=`). Com um domínio, busca o `cloudId` em `https://{domínio}.atlassian.net/_edge/tenant_info` (no dev e no tunnel, pelo Vite em `/__tenant_info`, porque o site do Jira não libera CORS; no app publicado, pelo proxy de escritas no mesmo caminho) e, se achar, preenche domínio e Cloud ID e pula o passo. Se não achar, o formulário abre para preencher, com o domínio já colocado quando ele veio do link. Sem domínio no endereço, o passo fica manual desde o início. Com a conta conectada, o `?dominio=` sai do endereço. Também dá para colar o JSON de Configurações, com `domain` e `clientId`. Contas salvas antes disso usam o site padrão de `src/api/jira-config.ts`. O gateway libera CORS; o endereço do site não libera e só serve para links de issue e ícones públicos (inclusive o logo do site: ver "Logo do site" em `kanban-domain.md`).
- Autenticação: `Authorization: Basic base64(email:token)`, com o e-mail da conta no Jira (qualquer domínio, inclusive provedores pessoais) e um token de API **com escopo** que cada pessoa informa no assistente de primeiro acesso. O relatório precisa de `read:jira-work` e `read:jira-user`; o Kanban também precisa de `read:board-scope:jira-software`, `read:board-scope.admin:jira-software` e `read:project:jira` (ver `kanban-domain.md`); `write:jira-work` é opcional e libera editar e lançar horas e mover cards.
- Busca de issues: `GET /rest/api/3/search/jql`, paginada por `nextPageToken`. Evite POST (ver abaixo).
- Leituras recusadas por excesso de requisições (429) são repetidas pelo `requestJira` até 3 vezes, respeitando `Retry-After` (ou 1s, 2s, 4s); escritas não são repetidas.
- **POST não funciona do navegador.** O Jira Cloud recusa POST com User-Agent de navegador vindo de outra origem (403 "XSRF check failed"), mesmo com `X-Atlassian-Token: no-check` (esse cabeçalho só vale para chamadas de fora do navegador), e o navegador não deixa trocar o User-Agent nem a origem. PUT não passa por esse check. Por isso o `requestJira` manda todo POST ao proxy de escritas, quando configurado (ver "Arquitetura"), e:
  - editar apontamento: `PUT .../worklog/{id}`, direto;
  - lançar horas: com o proxy, `POST .../worklog`. Sem ele, `PUT /rest/api/3/issue/{id}` com `update.worklog[].add` (`started`, `timeSpent` em minutos), que não aceita descrição; com descrição, o app acha o apontamento criado (mesma conta, início e duração; o mais novo) e manda a descrição num `PUT .../worklog/{id}` (`createWorklog`). Esse caminho exige as permissões "Editar itens" e "Trabalhar em itens" e o campo "Registrar trabalho" (Log Work) na tela de edição do projeto; sem o campo, o Jira responde 400 sobre `worklog` e a tela explica;
  - trocar status: só existe `POST .../transitions`. Com o proxy, funciona; sem ele, é recusado e a tela diz para trocar o status no Jira (`describeTransitionError`, com `isXsrfRejection`);
  - criar issue (subtarefa ou issue de épico, no modal da issue pai): só existe `POST /rest/api/3/issue`. Com o proxy, funciona; sem ele, é recusado e a tela explica (`describeCreateIssueError`);
  - editar título, descrição e relator: `PUT /rest/api/3/issue/{id}` (os campos precisam estar na tela de edição do projeto); responsável: `PUT .../issue/{id}/assignee`;
  - toda escrita manda `X-Atlassian-Token: no-check` (o `requestJira` já o envia em todo método que não é GET; o CORS do gateway e o do proxy liberam esse cabeçalho).
- Em 401/403, `JiraApiError.messages` traz a orientação do app, `details` o que o Jira respondeu e `accessProblem` o motivo; as mensagens de escrita mostram os dois (`jiraReason`).
- **Token expirado ou revogado.** O gateway responde 401 tanto para token que não vale mais quanto para token vivo sem o escopo da chamada ("Unauthorized; scope does not match"). Num 401 com a conta conectada, o `requestJira` confere o token pelo `GET /rest/api/3/myself` (uma conferência só para várias recusas juntas, válida por 15 s): 401 nele é token recusado (`accessProblem: 'token-rejected'`, `isTokenRejected`, mensagem `TOKEN_REJECTED_MESSAGE`); senão, é falta de escopo (`missing-scope`). 403 é falta de permissão (`forbidden`), nunca "token expirou".
  - Token recusado: `markTokenRejected` no `useJiraConnectionStore` abre, em qualquer tela, o aviso "O token do Jira parou de funcionar" (`TokenRejectedDialog`: expirou, pela validade dos tokens da Atlassian, ou foi revogado), com "Conectar com um token novo" e "Agora não"; o rodapé da lateral (`ConnectionStatus`) continua avisando, com "Conectar de novo". Conectar de novo abre o assistente só no passo do token, com o e-mail da conta, e mantém a squad (`reconnect` no `ConnectionWizard`, que pode ser cancelado); ao conectar, todas as buscas são refeitas (`resetQueries`).
  - Toda falha por esse motivo diz isso: as mensagens das telas e das escritas (`describeLogWorkError`, `describeIssueEditError`, `describeTransitionError`…) mostram a mensagem do token antes das de escopo e de permissão, e o teste de escrita (`fetchHasWriteAccess`) não guarda "sem escrita" por causa de um token recusado.
- Use JQL para filtrar issues (equivalente ao campo "JQL Issue Filter" da UI).
- Os worklogs vêm do Jira nativo (não há Tempo). A busca embute no máximo 20 worklogs por issue; acima disso, use `GET /rest/api/3/issue/{issueIdOrKey}/worklog` com `startedAfter`/`startedBefore`.

## Filtros (painel esquerdo)

- `From` / `To`: intervalo de datas (obrigatórios).
- `Projects`: seleção múltipla de projetos Jira.
- `Users & Groups`: seleção múltipla de usuários/grupos (default: usuário atual).
- `Additional Fields`: campos extras configuráveis para exibir na tabela.
- `JQL Issue Filter`: filtro livre em JQL, combinado com os filtros acima.

## Configuração do relatório (topo)

- `Group By`: agrupamento das linhas (ex: `Issue`).
- `Period Grouping`: granularidade das colunas de data (`Day`, e possivelmente `Week`/`Month`).
- `Time Format`: exibição do tempo (`Hours & Minutes` vs. decimal).
- `Time Zone`: fuso usado para os cálculos (`Current User` ou fixo).

## Tabela de resultados

- Coluna fixa `Issue` (chave da issue, linkada) + `Total Issue` (soma do período).
- Uma coluna por dia dentro do intervalo `From`–`To`, com o número da semana ISO abaixo da data (ex: "28 / 2ª").
- Linha `Total` no rodapé somando cada coluna de dia e o total geral.
- Células vazias quando não há apontamento naquele dia/issue.
- Issues na categoria Em andamento das pessoas do filtro (e dos projetos e do JQL) entram na tabela mesmo sem apontamento no período (`buildInProgressJql`: `statusCategory = "In Progress"` e `assignee`, no lugar de `worklogDate` e `worklogAuthor`). Ficam no topo, antes das demais, na ordem da chave. Nos agrupamentos, o grupo que tem alguma em andamento vem primeiro, e dentro dele as em andamento vêm primeiro.
- A coluna da descrição (a primeira, presa à esquerda) muda de largura pela divisa à direita dela, que tem a altura da tabela inteira: dá para arrastar a borda em qualquer linha, não só no cabeçalho (fica num trilho preso à esquerda, como a coluna, e acompanha a borda ao rolar para o lado). As alças na borda das outras colunas do cabeçalho também ajustam a descrição. Setas do teclado na divisa, Esc cancela o arrasto e o duplo clique volta ao padrão; a largura fica salva.

## Detalhes e edição de apontamentos

- Hover no horário de uma célula: tooltip com um trecho da descrição de cada apontamento.
- Clique numa célula de dia vazia, na linha de uma issue, com permissão de escrita: abre "Lançar horas" com a tarefa e o dia da célula já definidos (o foco vai para a hora de início). A célula mostra um sinal de mais no hover.
- Clique no horário de uma célula que já tem apontamento: modal com cada apontamento (pessoa, data, início–fim, duração, descrição) e o botão `Editar`. Numa célula de dia de uma issue, com permissão de escrita, o modal também tem `Adicionar`: abre "Lançar horas" já na tarefa e no dia da célula. Sem escrita, nas colunas de semana ou mês, e na linha de grupo, fica só a lista e o `Editar`.
- A edição muda data, hora de início, hora de fim e descrição. Os horários ficam no fuso do relatório, e a duração (`timeSpentSeconds`) é fim − início.
- A descrição é editada e salva como texto simples (ADF com um parágrafo por linha), então só vai no `PUT` quando muda: assim a formatação original é preservada.
- Depois de salvar, o apontamento é trocado no cache do relatório (TanStack Query), sem buscar o relatório inteiro de novo.
- Token sem `write:jira-work`: o modal fica só leitura, sem `Editar`, com um aviso do motivo. Não há endpoint que liste os escopos do token, então o app testa uma escrita inócua, `PUT /rest/api/3/issue/0/worklog/0` (apontamento inexistente): 401/403 = sem escopo; 404 = com escopo. O resultado fica em cache até trocar de conta (`src/api/jira-access.ts`, compartilhado com o Kanban).

## Modal da issue

- A chave de cada linha (e a da issue pai, nas linhas de grupo do agrupamento "Issue pai") abre o modal da issue, o mesmo do Kanban (`IssueDialog` em `src/components`, ver `kanban-domain.md`): status, detalhes, caminho até a pai, filhas, apontamentos e "Lançar horas". A chave no modal de apontamentos de uma célula também abre o modal da issue, no lugar dele.
- A chave é um link para `/#/reports?issue=CHAVE` (`useOpenIssue`): o clique simples abre o modal na hora e Ctrl/⌘ + clique abre outra aba com ele aberto. Recarregar reabre o modal. O link para o Jira fica no modal ("Abrir no Jira"); as exportações (PDF, HTML, Excel) continuam com o link do Jira.
- O modal abre só com o que o relatório tem da issue (`rowIssue`) e completa com os detalhes pela chave.
- Edição no lugar, criação de filhas e o tempo da issue pai: ver "Modal do card" em `kanban-domain.md` (o modal é o mesmo).

## Lançar horas

- O botão "Lançar horas", ao lado de "Atualizar", abre um modal para escolher a tarefa e lançar horas nela (`LogWorkDialog`), com o mesmo formulário do Kanban (data, início, fim e descrição, no fuso do relatório).
- O clique numa célula de dia vazia da linha da issue abre o mesmo modal já na tarefa e no dia da coluna (ver "Detalhes e edição de apontamentos"). "Trocar" volta à lista e mantém esse dia.
- A lista são as tarefas abertas atribuídas à pessoa (`assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC`, até 200), buscadas uma vez ao abrir o modal: tarefas de outras pessoas e concluídas não aparecem. Mostra até 50 de cada vez.
- A pesquisa filtra essa lista no navegador (`matchIssuesToLog`), sem nova busca no Jira: por número (`5151` acha CLI-5151; `515` acha também CLI-5152), chave (`cli-5151`) ou palavras do resumo, sem acento e sem diferenciar maiúsculas. O JQL não pesquisa parte da chave, por isso o filtro é local. A chave exata vem primeiro.
- Issues pai (épico ou com subtarefas) ficam fora, com um aviso de quantas: as horas vão nas subtarefas, como no modal da issue.
- A tarefa escolhida aparece com o título inteiro (na lista ele é cortado), o controle de tempo dela (lançado, estimativa e restante, com o aviso de estouro e a barra de progresso: o `TimeTracking` do modal da issue, em tamanho menor, com os números dos detalhes da issue quando chegam; aqui ele tem também "Com este": o lançado somado ao lançamento em edição, assim que início e fim estão preenchidos, em vermelho se passar da estimativa, com o aviso "Com este, fica X acima da estimativa" e o trecho listrado na barra; o `WorklogForm` avisa cada mudança por `onValuesChange`), o status com o seletor de troca (`StatusPicker`, o mesmo do modal da issue: transições possíveis, otimista, volta se o Jira recusar) e um accordion "Descrição" (`<details>`, fechado), com a descrição em texto simples vinda dos detalhes da issue.
- A lista fica entre as listas de issues em cache (`jiraKeys.issueLists`): trocar o status atualiza a tarefa nela, e a que vira concluída sai da lista.
- **Linha do tempo do dia** (`DayTimeline` em `src/components`, abaixo dos horários do formulário, via `renderAfterTimes` do `WorklogForm`): uma barra horizontal com os seus apontamentos do dia escolhido, em qualquer issue (chave no bloco; chave, horário, duração e resumo no tooltip), e o total já lançado no dia. Conforme início e fim são preenchidos, o lançamento novo aparece tracejado na mesma barra (só o início: uma marca), com o total "com este"; se cruza um horário que já tem apontamento, ele e os apontamentos cruzados ficam em vermelho e o aviso diz com quais ("Este horário coincide com CLI-5151 (09:00–10:30)"); senão, "Horário livre no seu dia". É só aviso: o Jira aceita apontamentos sobrepostos. A barra vai das 08h às 19h e cresce de hora em hora para caber tudo; trocar a data busca o outro dia.
  - Dados: `useMyDayWorklogsQuery` (`fetchMyDayWorklogs`, em `src/api/jira-day-worklogs.ts`): `worklogAuthor = currentUser() AND worklogDate` com um dia de folga para cada lado (o Jira avalia `worklogDate` no fuso do dono do token), os apontamentos da conta conectada que cruzam o dia, cortados a ele, no fuso do relatório; issues com mais de 20 apontamentos buscam os da janela no endpoint da issue. Fica sob `jiraKeys.worklogReports()`: lançar horas busca o dia de novo, e o novo bloco aparece.
- Depois de lançar, o relatório na tela busca de novo e mostra as horas novas. No cabeçalho, a caixa "Fechar ao concluir" (`closeOnSuccess` em `useLogWorkSettingsStore`, a mesma de Configurações > Conta > Lançar horas, salva neste navegador) fecha o modal quando o lançamento dá certo. Desmarcada (o padrão), o modal continua na mesma tarefa, com o aviso de sucesso acima do formulário e o formulário limpo para o próximo horário: mesma data, início, fim e descrição vazios, e o foco no início (o `WorklogForm` recomeça com outra `key`). O aviso sai ao lançar de novo ou ao trocar de tarefa ("Trocar" volta à lista).
- Token sem `write:jira-work`: o modal mostra só o aviso de somente leitura.

## Cronômetro

- O botão "Cronômetro", no cabeçalho do relatório, abre a janela `/#/stopwatch` (`openStopwatch`: 360×640). Ela conta o tempo de uma tarefa e lança as horas.
- **Atalho instalado:** a janela pequena (`?janela=1`, aberta com `window.open` e tamanho fixo) não instala: o Chrome mostra o diálogo e o fecha na hora. "Instalar" nela abre uma aba normal em `/cronometro/index.html` (`cronometro/index.html`, manifesto em `public/cronometro/manifest.webmanifest`, `start_url` e `scope` `/cronometro/`, `display: standalone`). Nessa aba, "Instalar" chama o diálogo do navegador. O ícone abre o cronômetro direto, com a conta do Jira já conectada naquele navegador. Com a conta conectada, o favicon da aba é o do site do Jira (o mesmo de `useJiraSiteFavicon`) e o atalho instalado usa essa imagem, redimensionada em `/cronometro/favicon` (`cronometro/iconPlugin.ts`, no servidor do Vite): a página só troca o manifesto (`?domain=`) depois que essa imagem abre. Sem o favicon do Jira, ficam os ícones locais. Sem o diálogo (Safari, ou o Chrome que ainda não ofereceu), o botão explica o menu: Chrome/Edge "Instalar Cronômetro"; Safari "Arquivo › Adicionar ao Dock". Na janela instalada, "Instalar" e "Fechar" somem. O service worker (`/cronometro/sw.js`) só cobre `/cronometro/` e não guarda arquivos. Sem hash no endereço, o script da página põe `#/stopwatch`.

## Geração do relatório

- Abrir a página do relatório já gera o relatório com os filtros salvos (os do último uso), como o botão "Gerar relatório", e liga a atualização automática dos filtros. Só com a conta conectada (no primeiro acesso, o assistente ainda define a squad como projeto) e só com filtros válidos; com filtros inválidos, a página espera o botão.

## Rota e link compartilhado

- O relatório fica em `/#/reports` (rotas: ver `kanban-domain.md`).
- O botão "Compartilhar" abre um diálogo: copiar (ou compartilhar pelo navegador) o link dos filtros, ou enviar esse mesmo recorte para um dispositivo conectado (P2P, ver `p2p-domain.md`). "Eu" no envio vira a pessoa de quem compartilhou. Quem recebe confirma e o relatório abre com esses filtros, buscado na conta dele; as horas não vão no envio.
- O link leva os filtros na query de dentro do hash: `/#/reports?from=…`. Links antigos, de antes das rotas (`/?from=…`), continuam valendo: `openLegacyShareLink` (em `main.tsx`) os leva para `/#/reports`.

## ⚠️ Segurança do token da API

O token da Jira concede acesso à conta do usuário, então:
- Ele é de cada pessoa, informado no assistente de conexão e salvo **cifrado** no IndexedDB (AES-GCM com chave não extraível, em `src/lib/encryptedStorage.ts`). Nunca coloque token em `.env`, no código ou no bundle (ex: `VITE_JIRA_TOKEN`).
- Oriente o menor escopo possível: os de leitura do relatório e do quadro, e `write:jira-work` só para quem vai editar ou lançar horas e mover cards. Não peça outros escopos de escrita.
- Não resolva segurança do token com backend/proxy: o token fica no navegador de cada pessoa. O proxy de escritas só repassa o token nos POST e não pode guardá-lo, registrá-lo nem usá-lo para outra coisa (ver "Arquitetura"). O MCP recebe o token no header de cada chamada, vindo da configuração do cliente de IA da pessoa, e segue a mesma regra (ver `mcp-domain.md`).
- A chave da OpenRouter (a IA do Dashboard) segue as mesmas regras: de cada pessoa, cifrada no IndexedDB pelo mesmo `encryptedStorage`, nunca em `.env` ou no bundle, e só vai para a OpenRouter. No Dashboard, vai para a IA só a estrutura do dashboard, nenhum dado do Jira (ver `builder-domain.md`); nas sugestões de subtarefa, só a história (título, descrição, estimativa), os títulos das filhas, os tipos de atividade escolhidos e as atividades, nunca nomes de pessoas (ver "Sugerir com IA" em `kanban-domain.md`).
- O token nunca vai pelas conexões entre dispositivos (WebRTC) nem no link de um dashboard ou de um relatório: lá vão só o perfil (e-mail, accountId e nome do dispositivo), a montagem do dashboard ou os filtros do relatório (ver `p2p-domain.md`). O que chega de outro navegador é validado campo a campo, a conta é conferida no Jira com o token de quem recebe, e tudo só aparece como texto.
- Com o token no navegador, XSS equivale a vazar o token: não renderize dados do Jira com `dangerouslySetInnerHTML`/`innerHTML` e escape tudo o que for para HTML exportado.
