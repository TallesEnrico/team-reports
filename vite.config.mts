import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cronometroIconPlugin } from './cronometro/iconPlugin';
import { tenantInfoUrl } from './src/features/jira-connection/lib/validateJiraSite';

/** Endereço público do tunnel, definido por scripts/cloudflare-tunnel.sh. */
const tunnelHost = process.env.PUBLIC_HOST;

/** O servidor MCP do Worker (proxy/src/mcp), em `/mcp` ou `/MCP`. O Vite lê chaves com `^` como RegExp, sem flags. */
const mcpPath = '^/[mM][cC][pP]/?(\\?.*)?$';
const workerProxy = { target: 'http://localhost:8787', changeOrigin: true };

function tenantInfoPlugin(): Plugin {
  return {
    name: 'tenant-info',
    configureServer(server) {
      server.middlewares.use('/__tenant_info', (req, res) => {
        void serveTenantInfo(req, res);
      });
    },
  };
}

async function serveTenantInfo(req: IncomingMessage, res: ServerResponse) {
  const send = (status: number, cloudId: string | null) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ cloudId }));
  };
  if (req.method !== 'GET') return send(405, null);
  const raw = req.url ?? '';
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  const target = tenantInfoUrl(new URLSearchParams(query).get('domain') ?? '');
  if (!target) return send(400, null);
  try {
    const upstream = await fetch(target, { headers: { Accept: 'application/json' } });
    if (!upstream.ok) return send(404, null);
    const body = (await upstream.json()) as { cloudId?: unknown };
    const cloudId = typeof body.cloudId === 'string' ? body.cloudId : null;
    send(cloudId ? 200 : 404, cloudId);
  } catch {
    send(502, null);
  }
}

// O build gera arquivos estáticos e o navegador chama o gateway da Atlassian
// direto (src/api/jira-config.ts). Só os POST vão pelo proxy de escritas (proxy/).
export default defineConfig({
  plugins: [tenantInfoPlugin(), cronometroIconPlugin(), react(), tailwindcss()],
  resolve: {
    // `@/` aponta para `src/` (espelhado em paths do tsconfig.app.json).
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        cronometro: fileURLToPath(new URL('./cronometro/index.html', import.meta.url)),
      },
    },
  },
  server: {
    // Sempre a 5173: é a origem em ALLOWED_ORIGINS do proxy e a porta para onde o tunnel aponta.
    port: 5173,
    strictPort: true,
    // O MCP no mesmo endereço do app (ex: https://PUBLIC_HOST/MCP no tunnel): o Vite o repassa ao Worker.
    proxy: { [mcpPath]: workerProxy, '/auth': workerProxy },
    ...(tunnelHost && {
      // Sem isso, o Vite recusa o Host público.
      allowedHosts: [tunnelHost, `.${tunnelHost}`],
      // O tunnel leva o endereço público só ao Vite, que repassa os POST (/rest/) ao
      // proxy de escritas. O Host vai como o do proxy: com o Host público, o wrangler dev
      // troca o https da origem por http, e o proxy recusa a origem.
      proxy: { [mcpPath]: workerProxy, '/auth': workerProxy, '/rest/': workerProxy },
    }),
  },
});
