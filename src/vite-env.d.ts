/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Endereço do proxy de escritas (`proxy/`); sem ele, os POST vão direto e o Jira os recusa. Ver `src/api/jira-config.ts`. */
  readonly VITE_JIRA_WRITE_PROXY_URL?: string;
  /** Endereço do servidor MCP mostrado em Configurações. Ver `src/api/jira-config.ts`. */
  readonly VITE_MCP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
