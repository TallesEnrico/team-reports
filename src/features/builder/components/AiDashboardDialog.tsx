import { ArrowSquareOut, CircleNotch, LockSimple, Sparkle } from '@phosphor-icons/react';
import { type FormEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { OPENROUTER_PRIVACY_URL, OpenRouterError } from '../../../api/openrouter';
import { AiModelSelect } from '../../../components/AiModelSelect';
import { Button } from '../../../components/Button';
import { Modal } from '../../../components/Modal';
import { Notice } from '../../../components/Notice';
import { OpenRouterKeyForm } from '../../../components/OpenRouterKeyForm';
import { OpenRouterKeyStatus } from '../../../components/OpenRouterKeyStatus';
import { useOpenRouterStore } from '../../../store/useOpenRouterStore';
import { useAiDashboardMutation } from '../api/useAiDashboardMutation';
import type { AiDashboardResult } from '../lib/ai/generate';
import { useBuilderStore } from '../store/useBuilderStore';
import type { Dashboard } from '../types';
import styles from './AiDashboardDialog.module.css';

/** O que a IA fez, para o aviso da tela (com o "Desfazer" de uma edição). */
export interface AiDashboardOutcome {
  kind: 'created' | 'edited';
  dashboardId: string;
  name: string;
  summary: string;
  fixes: string[];
  model: string;
  /** O dashboard antes da edição. */
  previous?: Dashboard;
}

interface AiDashboardDialogProps {
  /** O dashboard a mudar; sem ele, a IA cria um novo. */
  dashboard?: Dashboard;
  onClose: () => void;
  onDone: (outcome: AiDashboardOutcome) => void;
}

const CREATE_EXAMPLES = [
  'Quem não está lançando horas na minha squad',
  'Horas por squad e por semana neste mês',
  'Issues abertas acima da estimativa, por squad',
  'Minhas horas por dia e por issue no mês passado',
];

const EDIT_EXAMPLES = [
  'Adicione a comparação entre as pessoas da squad',
  'Troque o gráfico de barras por uma tabela',
  'Tire sábado e domingo das horas',
  'Mostre os últimos 30 dias',
];

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Segundos desde que `running` ficou verdadeiro (modelos gratuitos podem levar um minuto). */
function useElapsedSeconds(running: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  return seconds;
}

/**
 * Criar um dashboard com a IA, ou mudar o aberto, a partir de um pedido em
 * português. Sem chave da OpenRouter, começa pelo cadastro dela. Para a IA vão só
 * o pedido e a estrutura do dashboard; nenhum dado do Jira.
 */
export function AiDashboardDialog({ dashboard, onClose, onDone }: AiDashboardDialogProps) {
  const titleId = useId();
  const promptId = useId();
  const modelId = useId();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const status = useOpenRouterStore((state) => state.status);
  const apiKey = useOpenRouterStore((state) => state.apiKey);
  const importDashboard = useBuilderStore((state) => state.importDashboard);
  const replaceDashboard = useBuilderStore((state) => state.replaceDashboard);
  const setMode = useBuilderStore((state) => state.setMode);
  const [isChangingKey, setIsChangingKey] = useState(false);
  const [prompt, setPrompt] = useState('');
  const generate = useAiDashboardMutation();
  const elapsed = useElapsedSeconds(generate.isPending);
  const isEditing = Boolean(dashboard);
  const examples = isEditing ? EDIT_EXAMPLES : CREATE_EXAMPLES;
  const error = generate.error && !isAbort(generate.error) ? generate.error : null;
  const problem = error instanceof OpenRouterError ? error.problem : null;

  // Fechar o modal no meio do pedido cancela ele.
  useEffect(() => () => abortRef.current?.abort(), []);

  function apply(result: AiDashboardResult, previous: Dashboard | undefined) {
    const { summary, fixes, model } = result;
    if (previous) {
      replaceDashboard(previous.id, result);
      onDone({ kind: 'edited', dashboardId: previous.id, name: result.name, summary, fixes, model, previous });
    } else {
      const id = importDashboard({ ...result, skipped: 0 });
      // O dashboard pronto, para ver o resultado; "Montar" mostra as peças.
      setMode('view');
      const name = useBuilderStore.getState().dashboards.find((item) => item.id === id)?.name ?? result.name;
      onDone({ kind: 'created', dashboardId: id, name, summary, fixes, model });
    }
    onClose();
  }

  function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const text = prompt.trim();
    if (!text || generate.isPending) return;
    const controller = new AbortController();
    abortRef.current = controller;
    // A versão de agora (o dashboard pode ter mudado depois de o modal abrir).
    const previous = dashboard ? useBuilderStore.getState().dashboards.find((item) => item.id === dashboard.id) : undefined;
    generate.mutate(
      { prompt: text, current: previous, signal: controller.signal },
      { onSuccess: (result) => !controller.signal.aborted && apply(result, previous) },
    );
  }

  function cancel() {
    abortRef.current?.abort();
    generate.reset();
    promptRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) handleSubmit();
  }

  const title = isEditing ? `Editar "${dashboard!.name}" com IA` : 'Criar dashboard com IA';
  let body;
  if (status === 'loading') {
    body = <p className={styles.text}>Carregando…</p>;
  } else if (status === 'disconnected' || isChangingKey) {
    body = (
      <>
        {!isChangingKey && (
          <p className={styles.text}>
            A IA usa a OpenRouter, que tem modelos gratuitos. Cada pessoa usa a própria chave: cadastre a sua uma vez e ela
            fica salva neste navegador.
          </p>
        )}
        <OpenRouterKeyForm
          autoFocus
          onConnected={() => setIsChangingKey(false)}
          onCancel={status === 'connected' ? () => setIsChangingKey(false) : undefined}
        />
      </>
    );
  } else {
    body = (
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={promptId}>
            {isEditing ? 'O que mudar neste dashboard?' : 'O que você quer acompanhar?'}
          </label>
          <textarea
            ref={promptRef}
            id={promptId}
            className={`input ${styles.prompt}`}
            rows={4}
            maxLength={2000}
            autoFocus
            placeholder={isEditing ? 'Ex: adicione a comparação entre as pessoas da squad' : 'Ex: quem não está lançando horas na minha squad'}
            value={prompt}
            disabled={generate.isPending}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <ul className={styles.examples} aria-label="Exemplos">
            {examples.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  className={styles.example}
                  disabled={generate.isPending}
                  onClick={() => {
                    setPrompt(example);
                    promptRef.current?.focus();
                  }}
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <p className={styles.privacy}>
          <LockSimple size={14} weight="bold" aria-hidden />
          <span>
            Vão para a IA só o seu pedido e a estrutura do dashboard (peças, campos e títulos). Nenhum dado do Jira: nomes,
            issues, horas e as squads e pessoas escolhidas ficam no navegador.
            {isEditing && ' A IA reorganiza as peças no quadro, e dá para desfazer logo depois.'}
          </span>
        </p>

        {error && (
          <div className={styles.error}>
            <Notice tone="error">{error.message}</Notice>
            {problem === 'invalid-key' && (
              <Button variant="secondary" onClick={() => setIsChangingKey(true)}>
                Trocar chave
              </Button>
            )}
            {problem === 'data-policy' && (
              <a className={styles.link} href={OPENROUTER_PRIVACY_URL} target="_blank" rel="noopener noreferrer">
                Abrir a privacidade da OpenRouter
                <ArrowSquareOut size={14} weight="bold" aria-hidden />
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            )}
          </div>
        )}

        <div className={styles.settings}>
          <div className={styles.model}>
            <label className={styles.label} htmlFor={modelId}>
              Modelo
            </label>
            <AiModelSelect id={modelId} disabled={generate.isPending} className={styles.modelSelect} />
          </div>
          <div className={styles.key}>
            {apiKey && <OpenRouterKeyStatus apiKey={apiKey} />}
            <button type="button" className={styles.inlineButton} disabled={generate.isPending} onClick={() => setIsChangingKey(true)}>
              Trocar chave
            </button>
          </div>
        </div>

        <div className={styles.actions}>
          {generate.isPending ? (
            <>
              <p className={styles.progress} role="status">
                <CircleNotch size={16} weight="bold" className={styles.spinner} aria-hidden />
                {isEditing ? 'Mudando o dashboard' : 'Montando o dashboard'}… {elapsed}s
                {elapsed >= 20 && <span className={styles.progressHint}> Modelos gratuitos podem levar até um minuto.</span>}
              </p>
              <Button variant="secondary" onClick={cancel}>
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>
                Fechar
              </Button>
              <Button
                type="submit"
                variant="primary"
                icon={<Sparkle size={15} weight="fill" aria-hidden />}
                disabled={!prompt.trim()}
                title="⌘/Ctrl + Enter"
              >
                {isEditing ? 'Aplicar' : 'Criar dashboard'}
              </Button>
            </>
          )}
        </div>
      </form>
    );
  }

  return (
    <Modal
      labelledBy={titleId}
      onClose={onClose}
      closeOnBackdrop={!generate.isPending}
      header={
        <div className={styles.titles}>
          <h2 id={titleId} className={styles.title}>
            <Sparkle size={18} weight="fill" className={styles.titleIcon} aria-hidden />
            <span className={styles.titleText}>{title}</span>
          </h2>
          <p className={styles.subtitle}>
            {isEditing
              ? 'Peça a mudança em português. A IA ajusta as peças, e você confere no dashboard.'
              : 'Descreva o que você quer ver. A IA monta as peças, e depois é só ajustar.'}
          </p>
        </div>
      }
    >
      {body}
    </Modal>
  );
}
