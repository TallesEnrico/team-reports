/**
 * Configuração do MCP do Team Reports em cada cliente. O servidor recebe as
 * credenciais do Jira de cada pessoa no header `Authorization` (`Basic
 * base64(email:token)`, o mesmo do app) e o site no header `X-Jira-Site-Url`,
 * então todo formato leva esses headers.
 * O Claude Desktop só fala stdio: a extensão dele (`desktopExtension.ts`) monta
 * o header a partir do e-mail e do token que ele pede na instalação.
 */

export type McpClientId = 'codex' | 'cursor' | 'antigravity' | 'claude-code' | 'claude-desktop' | 'copilot';

/** Header de exemplo, na tela antes de mostrar o token. */
const MASKED_AUTHORIZATION = 'Basic ••••••••••••••••••••';

export interface McpSnippet {
  /** Onde colar (arquivo ou terminal). */
  target: string;
  language: 'json' | 'toml' | 'shell';
  text: string;
}

export interface McpInstall {
  /** Link que abre a instalação no próprio cliente (Cursor e VS Code). */
  deepLink?: { href: string; label: string };
  /** Arquivo que o cliente instala ao ser aberto (a extensão do Claude Desktop). */
  download?: { label: string; fileName: string; build: () => Promise<Blob> };
  /** Sem link nem arquivo: o botão principal copia o trecho (ex: o comando do Claude Code). */
  copyLabel?: string;
  /** O cliente pede o token na instalação: mostra "Copiar token". */
  copyToken?: boolean;
  /** Passos, na ordem. */
  steps: string[];
  snippet: McpSnippet;
}

export interface McpClient {
  id: McpClientId;
  name: string;
  /** Produto e onde ele roda, na linha de baixo do botão. */
  detail: string;
  /** Onde o token fica: em texto aberto na configuração do cliente ou no chaveiro do sistema. */
  tokenStorage: 'config' | 'keychain';
  install: (url: string, auth: McpInstallAuth) => McpInstall;
}

export const JIRA_SITE_HEADER = 'X-Jira-Site-Url';

const JIRA_DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function jiraSiteUrl(domain: string): string | null {
  const normalized = domain.trim().toLowerCase();
  return JIRA_DOMAIN.test(normalized) ? `https://${normalized}.atlassian.net` : null;
}

export function mcpServerName(siteUrl: string): string {
  const domain = new URL(siteUrl).hostname.replace(/\.atlassian\.net$/i, '');
  return `Team Reports ${domain}`;
}

export interface McpInstallAuth {
  email: string;
  /** O header `Authorization` (`Basic base64(email:token)`). */
  authorization: string;
  siteUrl: string;
}

function mcpHeaders(authorization: string, siteUrl: string): Record<string, string> {
  return { Authorization: authorization, [JIRA_SITE_HEADER]: siteUrl };
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** Base64 de texto ASCII (as configurações só têm ASCII: endereço e o header, já em base64). */
function base64(text: string): string {
  return btoa(text);
}

/** O formato `mcpServers` (Claude Code, Cursor e a maioria dos clientes). */
export function mcpServersJson(url: string, authorization: string, siteUrl: string): string {
  return json({ mcpServers: { [mcpServerName(siteUrl)]: { type: 'http', url, headers: mcpHeaders(authorization, siteUrl) } } });
}

/** As ferramentas do servidor (`proxy/src/mcp/tools.ts`), para a tela. */
export const MCP_TOOLS = [
  { name: 'criar_subtarefa', title: 'Criar subtarefa', access: 'write', description: 'Numa história, tarefa ou bug, com descrição e responsável.' },
  { name: 'ler_historia', title: 'Ler história', access: 'read', description: 'Detalhes, descrição, tempo e as filhas de uma issue.' },
  { name: 'buscar_issues', title: 'Buscar issues', access: 'read', description: 'Por responsável, status, projeto ou título. Em andamento: categoria In Progress.' },
  { name: 'ler_worklogs', title: 'Ler worklogs', access: 'read', description: 'Apontamentos por dia: os seus, de uma pessoa ou de uma issue.' },
  { name: 'lancar_horas', title: 'Lançar horas', access: 'write', description: 'Data, início e fim (ou duração) e a descrição.' },
  { name: 'mudar_status', title: 'Mudar status', access: 'write', description: 'Pelas transições possíveis da issue.' },
] as const;

export const MCP_CLIENTS: McpClient[] = [
  {
    id: 'codex',
    name: 'Codex',
    detail: 'OpenAI: CLI, app e extensão',
    tokenStorage: 'config',
    install: (url, { authorization, siteUrl }) => {
      const name = mcpServerName(siteUrl);
      return {
      steps: [
        'Abra (ou crie) o arquivo ~/.codex/config.toml. Ele vale para o Codex CLI, o app e a extensão da IDE.',
        'Cole o trecho abaixo no fim do arquivo e salve.',
        `Abra o Codex de novo e confira com /mcp: o ${name} aparece com as ${MCP_TOOLS.length} ferramentas.`,
      ],
      snippet: {
        target: '~/.codex/config.toml',
        language: 'toml',
        text: [
          `[mcp_servers.${JSON.stringify(name)}]`,
          `url = ${JSON.stringify(url)}`,
          `http_headers = { "Authorization" = ${JSON.stringify(authorization)}, "${JIRA_SITE_HEADER}" = ${JSON.stringify(siteUrl)} }`,
        ].join('\n'),
      },
    };
    },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    detail: 'Editor Cursor',
    tokenStorage: 'config',
    install: (url, { authorization, siteUrl }) => ({
      deepLink: {
        label: 'Abrir no Cursor',
        href: `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(mcpServerName(siteUrl))}&config=${encodeURIComponent(
          base64(JSON.stringify({ url, headers: mcpHeaders(authorization, siteUrl) })),
        )}`,
      },
      steps: [
        'Clique em "Abrir no Cursor" e confirme a instalação no Cursor.',
        'Sem o link: em ~/.cursor/mcp.json (todos os projetos) ou .cursor/mcp.json (só o projeto), junte o trecho abaixo ao que já existe em "mcpServers".',
        `Em Cursor Settings > MCP, o ${mcpServerName(siteUrl)} aparece ligado, com as ferramentas.`,
      ],
      snippet: {
        target: '~/.cursor/mcp.json',
        language: 'json',
        text: json({ mcpServers: { [mcpServerName(siteUrl)]: { url, headers: mcpHeaders(authorization, siteUrl) } } }),
      },
    }),
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    detail: 'Google Antigravity',
    tokenStorage: 'config',
    install: (url, { authorization, siteUrl }) => ({
      steps: [
        'No painel do agente, abra o menu "…" do topo > MCP Servers > Manage MCP Servers > View raw config.',
        'Junte o trecho abaixo ao que já existe em "mcpServers" e salve (o arquivo é ~/.gemini/config/mcp_config.json).',
        `Volte a Manage MCP Servers e atualize: o ${mcpServerName(siteUrl)} aparece com as ferramentas.`,
      ],
      snippet: {
        target: 'mcp_config.json',
        language: 'json',
        text: json({ mcpServers: { [mcpServerName(siteUrl)]: { serverUrl: url, headers: mcpHeaders(authorization, siteUrl) } } }),
      },
    }),
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    detail: 'Terminal e extensão do VS Code',
    tokenStorage: 'config',
    install: (url, { authorization, siteUrl }) => ({
      copyLabel: 'Copiar o comando',
      steps: [
        'Copie o comando e rode num terminal. Com --scope user, o MCP vale em todos os projetos, no terminal e na extensão do VS Code: os dois usam a mesma configuração.',
        'Só usa a extensão do VS Code? Ela não instala o comando claude no terminal: instale antes o Claude Code CLI (code.claude.com/docs/en/setup).',
        `Numa conversa nova, digite /mcp, no terminal ou no painel do Claude no VS Code: o ${mcpServerName(siteUrl)} aparece conectado.`,
        `Para trocar o token, remova antes o instalado: claude mcp remove --scope user ${JSON.stringify(mcpServerName(siteUrl))}.`,
      ],
      snippet: {
        target: 'Terminal',
        language: 'shell',
        text: `claude mcp add --transport http --scope user ${JSON.stringify(mcpServerName(siteUrl))} ${url} --header "Authorization: ${authorization}" --header "${JIRA_SITE_HEADER}: ${siteUrl}"`,
      },
    }),
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    detail: 'App do Claude no Mac e no Windows',
    tokenStorage: 'keychain',
    install: (url, { email, authorization, siteUrl }) => ({
      download: {
        label: 'Baixar a extensão',
        fileName: `${mcpServerName(siteUrl)}.mcpb`,
        build: async () => (await import('./desktopExtension')).buildDesktopExtension(url, email, siteUrl),
      },
      copyToken: true,
      steps: [
        `Baixe a extensão e abra o arquivo ${mcpServerName(siteUrl)}.mcpb (dois cliques, ou arraste para Configurações > Extensões no Claude Desktop). Clique em "Instalar".`,
        'Na configuração da extensão, confira o e-mail (já vem preenchido) e cole o token, com "Copiar token". O Claude Desktop guarda o token no chaveiro do sistema.',
        'Ligue a extensão. Numa conversa nova, as ferramentas do Team Reports aparecem no menu de ferramentas.',
        'Sem a extensão: em Configurações > Desenvolvedor > Editar configuração, junte o trecho abaixo ao que já existe em "mcpServers" e abra o Claude Desktop de novo. Precisa do Node.js instalado, e o token fica em texto aberto no arquivo.',
      ],
      snippet: {
        target: 'claude_desktop_config.json',
        language: 'json',
        // O mcp-remote liga o Claude Desktop (só stdio) ao servidor HTTP. O header vai sem espaço depois
        // dos dois-pontos e o valor numa variável: no Windows, espaços nos args quebram o comando.
        text: json({
          mcpServers: {
            [mcpServerName(siteUrl)]: {
              command: 'npx',
              args: [
                '-y',
                'mcp-remote',
                url,
                '--header',
                'Authorization:${TEAM_REPORT_AUTHORIZATION}',
                '--header',
                `${JIRA_SITE_HEADER}:${siteUrl}`,
              ],
              env: { TEAM_REPORT_AUTHORIZATION: authorization },
            },
          },
        }),
      },
    }),
  },
  {
    id: 'copilot',
    name: 'Copilot',
    detail: 'GitHub Copilot no VS Code',
    tokenStorage: 'config',
    install: (url, { authorization, siteUrl }) => ({
      deepLink: {
        label: 'Abrir no VS Code',
        href: `vscode:mcp/install?${encodeURIComponent(
          JSON.stringify({ name: mcpServerName(siteUrl), type: 'http', url, headers: mcpHeaders(authorization, siteUrl) }),
        )}`,
      },
      steps: [
        'Clique em "Abrir no VS Code" e confirme em "Install".',
        'Sem o link: rode "MCP: Open User Configuration" na paleta de comandos e junte o trecho abaixo ao que já existe em "servers".',
        `No chat do Copilot, no modo Agent, as ferramentas do ${mcpServerName(siteUrl)} aparecem no seletor de ferramentas.`,
      ],
      snippet: {
        target: 'mcp.json',
        language: 'json',
        text: json({ servers: { [mcpServerName(siteUrl)]: { type: 'http', url, headers: mcpHeaders(authorization, siteUrl) } } }),
      },
    }),
  },
];

/** O mesmo texto com o header no lugar do token, para mostrar na tela. */
export function maskAuthorization(text: string, authorization: string): string {
  return text.split(authorization).join(MASKED_AUTHORIZATION);
}
