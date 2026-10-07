import iconUrl from '../mcpb/icon.png';
import serverCode from '../mcpb/server.cjs?raw';
import { mcpServerName, MCP_TOOLS } from './mcpConfig';
import { createZip, type ZipEntry } from './zip';

/**
 * Extensão do Team Reports para o Claude Desktop (.mcpb, Desktop Extension): um
 * ZIP com o manifest.json e a ponte stdio → HTTP (`mcpb/server.cjs`), que o
 * Claude Desktop instala ao abrir o arquivo. Na instalação, ele pede o e-mail
 * (já preenchido aqui) e o token, que guarda no chaveiro do sistema: o token
 * nunca entra no arquivo. Montada no navegador, com o endereço do MCP do app.
 */

const SERVER_FILE = 'server.cjs';
const ICON_FILE = 'icon.png';

/** O manifest.json (manifest_version 0.3 do formato MCPB). */
export function desktopExtensionManifest(url: string, email: string, siteUrl: string, withIcon: boolean) {
  const name = new URL(siteUrl).hostname.replace(/\.atlassian\.net$/i, '');
  return {
    manifest_version: '0.3',
    name,
    display_name: mcpServerName(siteUrl),
    version: '1.0.0',
    description: 'Jira do Time: buscar issues, ler histórias e worklogs, criar subtarefas, lançar horas e mudar status.',
    author: { name: 'Time' },
    ...(withIcon && { icon: ICON_FILE }),
    server: {
      type: 'node',
      entry_point: SERVER_FILE,
      mcp_config: {
        command: 'node',
        args: [`\${__dirname}/${SERVER_FILE}`],
        env: {
          TEAM_REPORT_MCP_URL: url,
          TEAM_REPORT_SITE_URL: siteUrl,
          TEAM_REPORT_EMAIL: '${user_config.email}',
          TEAM_REPORT_TOKEN: '${user_config.token}',
        },
      },
    },
    tools: MCP_TOOLS.map(({ name, description }) => ({ name, description })),
    user_config: {
      email: {
        type: 'string',
        title: 'E-mail',
        description: 'O e-mail da sua conta do Jira.',
        required: true,
        default: email,
      },
      token: {
        type: 'string',
        title: 'Token da API do Jira',
        description: 'Escopos: read:jira-work e read:jira-user para ler; write:jira-work para as ferramentas de escrita.',
        required: true,
        sensitive: true,
      },
    },
    compatibility: { platforms: ['darwin', 'win32'], runtimes: { node: '>=18.0.0' } },
  };
}

/** O ícone é opcional: sem ele, a extensão instala com o ícone padrão. */
async function fetchIcon(): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const response = await fetch(iconUrl);
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export async function buildDesktopExtension(url: string, email: string, siteUrl: string): Promise<Blob> {
  const encoder = new TextEncoder();
  const icon = await fetchIcon();
  const manifest = desktopExtensionManifest(url, email, siteUrl, icon !== null);
  const entries: ZipEntry[] = [
    { name: 'manifest.json', data: encoder.encode(JSON.stringify(manifest, null, 2)) },
    { name: SERVER_FILE, data: encoder.encode(serverCode) },
  ];
  if (icon) entries.push({ name: ICON_FILE, data: icon });
  return createZip(entries);
}
