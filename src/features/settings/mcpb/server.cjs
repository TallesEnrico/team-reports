'use strict';

/**
 * Extensão do Team Reports para o Claude Desktop: ponte entre o stdio, o único
 * transporte do Claude Desktop para extensões, e o servidor MCP do Team Reports,
 * em HTTP (proxy/src/mcp). Cada linha do stdin é uma mensagem JSON-RPC,
 * repassada num POST com o header Authorization montado do e-mail e do token
 * da configuração da extensão (o Claude Desktop guarda o token no chaveiro do
 * sistema). O token só vai nesse header: nada é gravado nem registrado.
 *
 * O app monta o .mcpb com este arquivo (src/features/settings/lib/desktopExtension.ts).
 * Roda no Node que vem com o Claude Desktop, sem dependências.
 */

const readline = require('node:readline');

const url = process.env.TEAM_REPORT_MCP_URL;
const siteUrl = (process.env.TEAM_REPORT_SITE_URL || '').trim();
const email = (process.env.TEAM_REPORT_EMAIL || '').trim();
const token = (process.env.TEAM_REPORT_TOKEN || '').trim();
const authorization = email && token ? `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}` : null;

const TIMEOUT_MS = 60_000;

/** Versão do protocolo combinada no initialize, mandada nas mensagens seguintes. */
let protocolVersion = null;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

/** As requisições (com id) de uma mensagem ou lote: as que esperam resposta. */
function requestsOf(message) {
  return (Array.isArray(message) ? message : [message]).filter(
    (item) => item && typeof item.method === 'string' && item.id !== undefined && item.id !== null,
  );
}

function fail(requests, text) {
  for (const request of requests) send({ jsonrpc: '2.0', id: request.id, error: { code: -32603, message: text } });
}

async function forward(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido.' } });
    return;
  }
  const requests = requestsOf(message);

  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (authorization) headers.Authorization = authorization;
  if (siteUrl) headers['X-Jira-Site-Url'] = siteUrl;
  if (protocolVersion) headers['MCP-Protocol-Version'] = protocolVersion;

  let response;
  try {
    response = await fetch(url, { method: 'POST', headers, body: line, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    fail(requests, `Sem resposta do Team Reports (${url}): ${error.message}`);
    return;
  }
  // Notificações e respostas do cliente: 202, sem corpo.
  if (requests.length === 0) return;

  let reply = null;
  try {
    reply = JSON.parse(await response.text());
  } catch {
    // Tratado abaixo.
  }
  if (!reply || typeof reply !== 'object') {
    fail(requests, `O Team Reports respondeu ${response.status} sem uma mensagem JSON-RPC.`);
    return;
  }
  // Erro sem id (recusado antes de ler a mensagem): vai para cada requisição, senão o cliente fica esperando.
  if (!Array.isArray(reply) && reply.id === null && reply.error) {
    fail(requests, reply.error.message);
    return;
  }

  for (const item of Array.isArray(reply) ? reply : [reply]) {
    const version = item && item.result && item.result.protocolVersion;
    const isInitialize = requests.some((request) => request.method === 'initialize' && request.id === item.id);
    if (isInitialize && typeof version === 'string') protocolVersion = version;
  }
  send(reply);
}

if (!url) {
  process.stderr.write('Team Reports: falta o endereço do servidor MCP (TEAM_REPORT_MCP_URL).\n');
  process.exit(1);
}
if (!authorization) process.stderr.write('Team Reports: falta o e-mail ou o token na configuração da extensão.\n');

// O Claude Desktop fechou a conexão: sai sem erro.
process.stdout.on('error', () => process.exit(0));

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (line.trim()) void forward(line);
});
