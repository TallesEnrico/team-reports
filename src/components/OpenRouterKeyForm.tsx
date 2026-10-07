import { ArrowSquareOut, Eye, EyeSlash, LockSimple } from '@phosphor-icons/react';
import { type FormEvent, useId, useState } from 'react';
import { OPENROUTER_KEYS_URL, OPENROUTER_SIGNUP_URL } from '../api/openrouter';
import { useConnectOpenRouterMutation } from '../api/useConnectOpenRouterMutation';
import { Button } from './Button';
import { FormField } from './FormField';
import { Notice } from './Notice';
import styles from './OpenRouterKeyForm.module.css';

interface OpenRouterKeyFormProps {
  /** A chave foi conferida e salva. */
  onConnected?: () => void;
  /** "Voltar" (trocando uma chave que já existe). */
  onCancel?: () => void;
  autoFocus?: boolean;
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a className={styles.link} href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <ArrowSquareOut size={14} weight="bold" aria-hidden />
      <span className="sr-only"> (abre em nova aba)</span>
    </a>
  );
}

/**
 * Cadastro da chave da OpenRouter (a IA do Dashboard): os passos para criar a
 * conta e gerar a chave, e o campo para colar. A chave é conferida na
 * OpenRouter antes de ser salva, cifrada, neste navegador.
 */
export function OpenRouterKeyForm({ onConnected, onCancel, autoFocus = false }: OpenRouterKeyFormProps) {
  const inputId = useId();
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const connect = useConnectOpenRouterMutation();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!key.trim() || connect.isPending) return;
    connect.mutate(key, { onSuccess: () => onConnected?.() });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <ol className={styles.steps}>
        <li>
          <span className={styles.stepText}>Crie a sua conta na OpenRouter. É grátis e não pede cartão.</span>
          <ExternalLink href={OPENROUTER_SIGNUP_URL}>Criar conta</ExternalLink>
        </li>
        <li>
          <span className={styles.stepText}>
            Gere uma chave em <strong>Keys</strong> &gt; <strong>Create API Key</strong>. Sem créditos, ela vale para os modelos
            gratuitos, com até 50 pedidos por dia.
          </span>
          <ExternalLink href={OPENROUTER_KEYS_URL}>Gerar chave</ExternalLink>
        </li>
        <li>
          <span className={styles.stepText}>Cole a chave aqui.</span>
        </li>
      </ol>

      <FormField label="Chave da OpenRouter" htmlFor={inputId}>
        <div className={styles.secretField}>
          <input
            id={inputId}
            className="input"
            type={showKey ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-or-v1-…"
            autoFocus={autoFocus}
            value={key}
            aria-invalid={connect.isError || undefined}
            onChange={(event) => {
              setKey(event.target.value);
              if (connect.isError) connect.reset();
            }}
          />
          <button
            type="button"
            className={styles.reveal}
            onClick={() => setShowKey((visible) => !visible)}
            aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'}
            aria-pressed={showKey}
          >
            {showKey ? <EyeSlash size={16} weight="bold" /> : <Eye size={16} weight="bold" />}
          </button>
        </div>
      </FormField>

      {connect.error && <Notice tone="error">{connect.error.message}</Notice>}

      <p className={styles.note}>
        <LockSimple size={14} weight="bold" aria-hidden />
        <span>A chave fica cifrada neste navegador, como o token do Jira, e só vai para a OpenRouter.</span>
      </p>

      <div className={styles.actions}>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={connect.isPending}>
            Voltar
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={!key.trim() || connect.isPending}>
          {connect.isPending ? 'Conferindo…' : 'Salvar chave'}
        </Button>
      </div>
    </form>
  );
}
