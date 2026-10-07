/** Variáveis do Worker (`wrangler.toml`, `[vars]`). */
export interface Env {
  /** Site do Jira (o mesmo de `src/api/jira-config.ts`, no app). */
  JIRA_CLOUD_ID: string;
  /** Endereços do app que podem usar o proxy, separados por vírgula. */
  ALLOWED_ORIGINS: string;
  /** OAuth 2.0 (3LO) da Atlassian. Só o Worker lê; o secret nunca vai ao frontend. */
  ATLASSIAN_CLIENT_ID?: string;
  ATLASSIAN_CLIENT_SECRET?: string;
  ATLASSIAN_REDIRECT_URI?: string;
}

export function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** API do Jira pelo gateway da Atlassian (a mesma que o app usa). */
export function jiraApiBase(env: Env): string {
  return `https://api.atlassian.com/ex/jira/${env.JIRA_CLOUD_ID}`;
}
