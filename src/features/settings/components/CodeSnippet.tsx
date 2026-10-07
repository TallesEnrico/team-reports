import { Check, Copy, Eye, EyeSlash } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '../../../components/Button';
import { useCopyToClipboard } from '../../../hooks/useCopyToClipboard';
import { maskAuthorization } from '../lib/mcpConfig';
import styles from './CodeSnippet.module.css';

interface CodeSnippetProps {
  /** Onde colar (arquivo ou terminal), no topo do bloco. */
  target: string;
  text: string;
  /** O header com o token: aparece mascarado até "Mostrar token"; o "Copiar" leva o texto inteiro. */
  authorization: string;
}

/** Trecho de configuração para copiar, com o token escondido na tela. */
export function CodeSnippet({ target, text, authorization }: CodeSnippetProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const { copy, copied } = useCopyToClipboard();

  async function handleCopy() {
    const ok = await copy(text);
    setCopyFailed(!ok);
    // Sem a área de transferência (permissão negada): o texto aparece inteiro para copiar à mão.
    if (!ok) setIsRevealed(true);
  }

  return (
    <figure className={styles.snippet}>
      <figcaption className={styles.bar}>
        <span className={styles.target}>{target}</span>
        <span className={styles.actions}>
          <Button
            variant="ghost"
            className={styles.action}
            icon={isRevealed ? <EyeSlash size={14} weight="bold" aria-hidden /> : <Eye size={14} weight="bold" aria-hidden />}
            aria-pressed={isRevealed}
            onClick={() => setIsRevealed((revealed) => !revealed)}
          >
            {isRevealed ? 'Ocultar token' : 'Mostrar token'}
          </Button>
          <Button
            variant="ghost"
            className={styles.action}
            icon={copied ? <Check size={14} weight="bold" aria-hidden /> : <Copy size={14} weight="bold" aria-hidden />}
            onClick={() => void handleCopy()}
          >
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
        </span>
      </figcaption>
      <pre className={styles.code}>
        <code>{isRevealed ? text : maskAuthorization(text, authorization)}</code>
      </pre>
      {copyFailed && <p className={styles.failed}>O navegador não deixou copiar: selecione o texto e copie.</p>}
    </figure>
  );
}
