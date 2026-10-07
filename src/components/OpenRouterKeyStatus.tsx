import { useOpenRouterKeyInfoQuery } from '../api/useOpenRouterKeyInfoQuery';
import { OpenRouterError } from '../api/openrouter';
import { cx } from '../lib/cx';
import styles from './OpenRouterKeyStatus.module.css';

/** "sk-or-v1-763…820": o começo e o fim, para reconhecer a chave sem mostrar ela. */
function maskKey(apiKey: string): string {
  return `${apiKey.slice(0, 12)}…${apiKey.slice(-3)}`;
}

/** A chave cadastrada e quantos pedidos gratuitos sobram hoje (a OpenRouter diz, sem gastar pedido). */
export function OpenRouterKeyStatus({ apiKey, className }: { apiKey: string; className?: string }) {
  const info = useOpenRouterKeyInfoQuery(apiKey);
  const rejected = info.error instanceof OpenRouterError && info.error.problem === 'invalid-key';
  const free = info.data?.freeRequests;

  return (
    <p className={cx(styles.status, className)}>
      <span className={styles.key}>{info.data?.label || maskKey(apiKey)}</span>
      {rejected && <span className={styles.rejected}>A OpenRouter recusou esta chave</span>}
      {free && (
        <span className={cx(styles.usage, free.remaining === 0 && styles.rejected)}>
          {free.remaining} de {free.limit} pedidos gratuitos hoje
        </span>
      )}
    </p>
  );
}
