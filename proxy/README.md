# Proxy de escritas e servidor MCP

Cloudflare Worker com duas portas que não se misturam:
- o **proxy de escritas** (todo caminho fora de `/mcp`): repassa ao Jira os POST que o navegador não consegue fazer. É o único uso que o app faz do Worker;
- o **servidor MCP** (`/mcp` ou `/MCP`, em `src/mcp`): as ferramentas do Jira para assistentes de IA (Codex, Cursor, Antigravity, Claude, Copilot). Ver "Servidor MCP", abaixo.

**Por quê:** o Jira Cloud recusa POST vindo do navegador de outra origem (403 "XSRF check failed"), mesmo com `X-Atlassian-Token: no-check`: esse cabeçalho só vale para chamadas de fora do navegador. O Worker refaz o POST do lado do servidor, sem a origem nem o User-Agent do navegador.

**O que ele faz (e só isso):**
- aceita só `POST /rest/api/3/issue/{id}/transitions` (trocar status), `POST /rest/api/3/issue/{id}/worklog` (lançar horas) e `POST /rest/api/3/issue` (criar subtarefas e issues de épico);
- só para o site do Jira em `JIRA_CLOUD_ID` e só para as origens em `ALLOWED_ORIGINS` (`wrangler.toml`);
- repassa o cabeçalho `Authorization` (o token de cada pessoa) sem guardar nem registrar nada (`observability` desligada).

Leituras e PUT não passam por aqui: o app chama o gateway da Atlassian direto. Um POST novo no app precisa entrar em `ALLOWED_PATHS` (`src/index.ts`).

## Testar na sua máquina

Não precisa de conta na Cloudflare. O Wrangler exige Node 22 ou mais novo (`nvm use` na raiz usa a versão do `.nvmrc`).

1. Instale as dependências do proxy (uma vez):
   ```sh
   cd proxy
   bun install
   ```
2. Na raiz do projeto, crie `.env.local` (ou copie `.env.example`) com:
   ```
   VITE_JIRA_WRITE_PROXY_URL=http://localhost:8787
   ```
3. Suba o app com `bun run dev` na raiz: ele sobe o Vite e o proxy juntos (o proxy fica em `http://localhost:8787`). Para subir só um deles: `bun run dev:app` ou `bun run dev:proxy`. O Vite só lê o `.env.local` ao subir.
4. Teste mover um card no Kanban, trocar o status no modal da issue, lançar horas e criar uma subtarefa no modal da issue pai.

O app sobe sempre em `http://localhost:5173`, a origem liberada em `ALLOWED_ORIGINS` (com a porta ocupada, o Vite para em vez de pegar outra). Uma origem fora da lista recebe 421 do proxy, dizendo qual foi recusada.

## Abrir de fora da máquina (tunnel da Cloudflare)

`bun run dev:tunnel` (ou `make run`) sobe o app, o proxy e um tunnel nomeado da Cloudflare (`scripts/cloudflare-tunnel.sh`), e o app abre em `https://PUBLIC_HOST`. Os POST vão pelo mesmo endereço: o Vite repassa os caminhos `/rest/` ao proxy, então lançar horas e trocar status funcionam também em outra máquina. Não use junto com o `bun run dev`: o tunnel já sobe os dois.

1. Em `.env.local`, defina o tunnel e o endereço público (ver `.env.example`):
   ```
   TUNNEL_NAME=meu-tunnel
   PUBLIC_HOST=team-report.exemplo.com.br
   ```
2. No tunnel, leve o endereço público ao Vite, `http://localhost:5173` (só essa rota; o proxy não precisa de outra):
   - tunnel gerenciado pelo painel da Cloudflare (Zero Trust > Networks > Tunnels): uma rota pública (public hostname) com esse endereço e o serviço `http://localhost:5173`. Nesse caso o cloudflared ignora as regras do `~/.cloudflared/config.yml`;
   - tunnel gerenciado pelo arquivo: no `~/.cloudflared/config.yml`, antes da regra final (`service: http_status:404`):
     ```yaml
       - hostname: team-report.exemplo.com.br
         service: http://localhost:5173
     ```
     e crie o DNS (uma vez): `cloudflared tunnel route dns meu-tunnel team-report.exemplo.com.br`. Se o cloudflared responder `unauthorized`, rode antes `cloudflared tunnel login`.

Nesse modo, o script libera o endereço público só enquanto roda: o Vite aceita o Host (`server.allowedHosts`) e repassa `/rest/` ao proxy (`server.proxy`, com o Host do proxy: com o Host público, o `wrangler dev` troca o `https` da origem por `http`, e o proxy recusaria a origem), o app manda os POST para `https://PUBLIC_HOST` e o proxy aceita essa origem (`--var ALLOWED_ORIGINS`, sem mudar o `wrangler.toml`). Antes de subir, ele confere o DNS, as portas e a versão do Node, e diz o que falta. Para ver as rotas que o tunnel em execução usa de fato: `curl http://127.0.0.1:20241/config`.

## Servidor MCP

Ferramentas: `criar_subtarefa`, `ler_historia`, `buscar_issues`, `ler_worklogs`, `lancar_horas` e `mudar_status` (detalhes em `ia/instructions/mcp-domain.md`). Transporte Streamable HTTP sem sessão: POST com JSON-RPC, resposta em JSON.

Cada chamada leva as credenciais do Jira da pessoa no header `Authorization: Basic base64(email:token)` (o mesmo do app), e as ferramentas agem como essa conta. O Worker não guarda nem registra o token. A tela Configurações do app (`/#/settings`) monta a configuração de cada cliente com esse header.

Testar na sua máquina, com o proxy no ar (`bun run dev` na raiz, ou `bun run dev` aqui):

```sh
# Conectar e listar as ferramentas (não precisa de token)
curl -s http://localhost:8787/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Chamar uma ferramenta com o seu token
AUTH="Basic $(printf '%s' 'seu-email@gmail.com.br:seu-token' | base64)"
curl -s http://localhost:8787/mcp -H 'Content-Type: application/json' -H "Authorization: $AUTH" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ler_historia","arguments":{"issueKey":"CLI-5151"}}}'
```

Também dá para testar no MCP Inspector (`bunx @modelcontextprotocol/inspector`), com o transporte "Streamable HTTP", o endereço `http://localhost:8787/mcp` e o header `Authorization`.

No tunnel (`bun run dev:tunnel`), o MCP fica em `https://PUBLIC_HOST/mcp`: o Vite repassa `/mcp` ao Worker, como faz com `/rest/`. Em Configurações, o endereço é o da página (`/mcp`); em `teamreports.com.br`, entra o subdomínio da conta. `VITE_MCP_URL` só quando o MCP não está nesse host (Worker local).

## Publicar

1. `bunx wrangler login` (uma vez, com a conta da Cloudflare da empresa).
2. Em `wrangler.toml`, inclua o endereço do app publicado em `ALLOWED_ORIGINS`.
3. `bun run deploy`: o Wrangler mostra o endereço do Worker (ex: `https://team-report-proxy.<conta>.workers.dev`).
4. No build do app, defina `VITE_JIRA_WRITE_PROXY_URL` com o endereço publicado. O MCP não entra no build: em Configurações ele usa o host da página, com o subdomínio da conta em `teamreports.com.br`.

Sem `VITE_JIRA_WRITE_PROXY_URL`, o app funciona como antes: lança horas pela edição da issue (PUT) e não troca status.
