import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { Plugin } from 'vite';
import { isJiraDomainName, normalizeJiraDomain } from '../src/features/jira-connection/lib/validateJiraSite';

const execFileAsync = promisify(execFile);
const manifestPath = fileURLToPath(new URL('../public/cronometro/manifest.webmanifest', import.meta.url));
const iconCache = new Map<string, Buffer>();

function requestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? '/', 'http://localhost');
}

function domainOf(url: URL): string | null {
  const domain = normalizeJiraDomain(url.searchParams.get('domain') ?? '');
  return isJiraDomainName(domain) ? domain : null;
}

async function readPngSize(file: string): Promise<{ width: number; height: number }> {
  const { stdout } = await execFileAsync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
  const width = Number(stdout.match(/pixelWidth: (\d+)/)?.[1] ?? 0);
  const height = Number(stdout.match(/pixelHeight: (\d+)/)?.[1] ?? 0);
  return { width, height };
}

async function squarePng(input: Buffer, size: number): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), 'cronometro-icon-'));
  try {
    const source = path.join(dir, 'in.png');
    const padded = path.join(dir, 'pad.png');
    const out = path.join(dir, 'out.png');
    await writeFile(source, input);
    const { width, height } = await readPngSize(source);
    const side = String(Math.max(width, height, 1));
    await execFileAsync('sips', ['--padToHeightWidth', side, side, '--padColor', 'FFFFFF', source, '--out', padded]);
    await execFileAsync('sips', ['-z', String(size), String(size), padded, '--out', out]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function jiraFavicon(domain: string): Promise<Buffer | null> {
  const cached = iconCache.get(`${domain}:raw`);
  if (cached) return cached;
  const response = await fetch(`https://${domain}.atlassian.net/jira-favicon-scaled.png`, {
    headers: { Accept: 'image/png,image/*;q=0.8' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const type = response.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > 2_000_000) return null;
  iconCache.set(`${domain}:raw`, bytes);
  return bytes;
}

async function sizedFavicon(domain: string, size: 192 | 512): Promise<Buffer | null> {
  const key = `${domain}:${size}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const raw = await jiraFavicon(domain);
  if (!raw) return null;
  const png = await squarePng(raw, size);
  iconCache.set(key, png);
  return png;
}

async function serveFavicon(url: URL, res: ServerResponse) {
  const domain = domainOf(url);
  const size = url.searchParams.get('size') === '512' ? 512 : url.searchParams.get('size') === '192' ? 192 : null;
  if (!domain || !size) {
    res.statusCode = 400;
    res.end();
    return;
  }
  try {
    const png = await sizedFavicon(domain, size);
    if (!png) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(png);
  } catch {
    res.statusCode = 404;
    res.end();
  }
}

async function serveManifest(url: URL, res: ServerResponse) {
  const domain = domainOf(url);
  if (!domain) {
    res.statusCode = 400;
    res.end();
    return;
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { icons: unknown };
  const query = `domain=${encodeURIComponent(domain)}`;
  manifest.icons = [
    { src: `/cronometro/favicon?${query}&size=192`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `/cronometro/favicon?${query}&size=512`, sizes: '512x512', type: 'image/png', purpose: 'any' },
  ];
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'no-cache');
  res.end(JSON.stringify(manifest));
}

function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = requestUrl(req);
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (url.pathname === '/cronometro/favicon') {
    void serveFavicon(url, res);
    return;
  }
  if (url.pathname === '/cronometro/manifest.webmanifest' && url.searchParams.has('domain')) {
    void serveManifest(url, res);
    return;
  }
  next();
}

export function cronometroIconPlugin(): Plugin {
  return {
    name: 'cronometro-icon',
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}
