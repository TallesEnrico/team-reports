import {
  CaretRight,
  Check,
  Copy,
  CursorClick,
  Desktop,
  GithubLogo,
  type Icon,
  Planet,
  Sparkle,
  TerminalWindow,
} from '@phosphor-icons/react';
import { useId, useState } from 'react';
import { basicAuthorization } from '../../../api/jira-client';
import { mcpUrl } from '../../../api/jira-config';
import { Button } from '../../../components/Button';
import { useCopyToClipboard } from '../../../hooks/useCopyToClipboard';
import { cx } from '../../../lib/cx';
import { useJiraConnectionStore } from '../../../store/useJiraConnectionStore';
import { jiraSiteUrl, MCP_CLIENTS, MCP_TOOLS, type McpClient, type McpClientId, mcpServersJson } from '../lib/mcpConfig';
import { CodeSnippet } from './CodeSnippet';
import { McpInstallDialog } from './McpInstallDialog';
import styles from './McpSection.module.css';
import sectionStyles from './Section.module.css';

const CLIENT_ICONS: Record<McpClientId, Icon> = {
  codex: TerminalWindow,
  cursor: CursorClick,
  antigravity: Planet,
  'claude-code': Sparkle,
  'claude-desktop': Desktop,
  copilot: GithubLogo,
};

/**
 * O MCP do Team Reports: as ferramentas, os botões de instalação de cada cliente
 * e a configuração em JSON. O servidor fica no Worker (`proxy/src/mcp`) e age
 * como a conta do token que vai no header `Authorization` da configuração.
 */
export function McpSection() {
  const headingId = useId();
  const credentials = useJiraConnectionStore((state) => state.credentials);
  const apiCredentials = credentials?.authMethod === 'oauth' ? null : credentials;
  const [installing, setInstalling] = useState<McpClient | null>(null);
  const urlCopy = useCopyToClipboard();
  const authorization = apiCredentials ? basicAuthorization(apiCredentials) : null;
  const siteUrl = credentials?.domain ? jiraSiteUrl(credentials.domain) : null;
  const url = mcpUrl(credentials?.domain);

  return (
    <section className={sectionStyles.section} aria-labelledby={headingId}>
      <div className={sectionStyles.head}>
        <h2 id={headingId} className={sectionStyles.heading}>
          MCP
        </h2>
        <p className={sectionStyles.description}>
          Instale o MCP do Team Reports no seu assistente de IA para ele buscar issues, ler histórias e worklogs, criar
          subtarefas, lançar horas e mudar status no Jira. Ele age como a conta do token da instalação, com as permissões dela.
        </p>
      </div>

      <div className={sectionStyles.card}>
        <h3 className={sectionStyles.subheading}>Ferramentas</h3>
        <ul className={styles.tools}>
          {MCP_TOOLS.map((tool) => (
            <li key={tool.name} className={styles.tool}>
              <span className={styles.toolHead}>
                <span className={styles.toolTitle}>{tool.title}</span>
                <span className={cx(styles.access, tool.access === 'write' && styles.write)}>
                  {tool.access === 'write' ? 'escrita' : 'leitura'}
                </span>
              </span>
              <code className={styles.toolName}>{tool.name}</code>
              <span className={styles.toolDescription}>{tool.description}</span>
            </li>
          ))}
        </ul>
        <p className={sectionStyles.cardText}>
          Escopos do token: <code>read:jira-work</code> e <code>read:jira-user</code> para ler; <code>write:jira-work</code>{' '}
          para as de escrita.
        </p>
      </div>

      <div className={sectionStyles.card}>
        <h3 className={sectionStyles.subheading}>Instalar</h3>
        <p className={sectionStyles.cardText}>
          Escolha o cliente: a instalação usa o seu token cadastrado ou outro, à sua escolha.
        </p>
        <ul className={styles.clients}>
          {MCP_CLIENTS.map((client) => {
            const ClientIcon = CLIENT_ICONS[client.id];
            return (
              <li key={client.id}>
                <button type="button" className={styles.client} onClick={() => setInstalling(client)}>
                  <span className={styles.clientIcon}>
                    <ClientIcon size={18} weight="bold" aria-hidden />
                  </span>
                  <span className={styles.clientText}>
                    <span className={styles.clientName}>{client.name}</span>
                    <span className={styles.clientDetail}>{client.detail}</span>
                  </span>
                  <CaretRight size={14} weight="bold" className={styles.caret} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={sectionStyles.card}>
        <h3 className={sectionStyles.subheading}>Configuração</h3>
        <div className={styles.url}>
          <span className={styles.urlLabel}>Endereço</span>
          <code className={styles.urlValue}>{url}</code>
          <Button
            variant="secondary"
            className={styles.urlCopy}
            icon={urlCopy.copied ? <Check size={14} weight="bold" aria-hidden /> : <Copy size={14} weight="bold" aria-hidden />}
            onClick={() => void urlCopy.copy(url)}
          >
            {urlCopy.copied ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
        <p className={sectionStyles.cardText}>
          No formato <code>mcpServers</code>, o mais comum (cada instalador acima tem o formato exato do seu cliente), com o
          servidor em HTTP e o seu token cadastrado no header <code>Authorization</code> (<code>Basic</code> + base64 de{' '}
          <code>e-mail:token</code>). Quem tiver esse arquivo usa o Jira como você.
        </p>
        {credentials?.authMethod === 'oauth' && (
          <p className={sectionStyles.cardText}>
            O login com Atlassian não entra nesta configuração: o acesso expira em cerca de uma hora e não deve ficar gravado no
            cliente. Instale o MCP com um token de API.
          </p>
        )}
        {authorization && siteUrl ? (
          <CodeSnippet target="mcp.json" text={mcpServersJson(url, authorization, siteUrl)} authorization={authorization} />
        ) : (
          <p className={styles.disconnected}>Conecte sua conta do Jira para ver a configuração.</p>
        )}
      </div>

      {installing && <McpInstallDialog client={installing} onClose={() => setInstalling(null)} />}
    </section>
  );
}
