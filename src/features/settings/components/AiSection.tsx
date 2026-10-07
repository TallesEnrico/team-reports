import { useId, useState } from 'react';
import { AiModelSelect } from '../../../components/AiModelSelect';
import { Button } from '../../../components/Button';
import { FormField } from '../../../components/FormField';
import { OpenRouterKeyForm } from '../../../components/OpenRouterKeyForm';
import { OpenRouterKeyStatus } from '../../../components/OpenRouterKeyStatus';
import { useOpenRouterStore } from '../../../store/useOpenRouterStore';
import styles from './AiSection.module.css';
import sectionStyles from './Section.module.css';

/**
 * "IA do Dashboard": a chave da OpenRouter que cria e edita dashboards no
 * Dashboard (cifrada neste navegador) e o modelo. Trocar ou remover a chave.
 */
export function AiSection() {
  const headingId = useId();
  const modelId = useId();
  const status = useOpenRouterStore((state) => state.status);
  const apiKey = useOpenRouterStore((state) => state.apiKey);
  const disconnect = useOpenRouterStore((state) => state.disconnect);
  const [isChangingKey, setIsChangingKey] = useState(false);

  return (
    <section className={sectionStyles.section} aria-labelledby={headingId}>
      <div className={sectionStyles.head}>
        <h2 id={headingId} className={sectionStyles.heading}>
          IA do Dashboard
        </h2>
        <p className={sectionStyles.description}>
          No Dashboard, a IA cria e edita dashboards a partir de um pedido em português, pela OpenRouter, com a sua chave.
          Vão para ela só o pedido e a estrutura do dashboard; nenhum dado do Jira.
        </p>
      </div>
      <div className={sectionStyles.card}>
        {status === 'loading' && <p className={sectionStyles.cardText}>Carregando…</p>}
        {(status === 'disconnected' || isChangingKey) && (
          <OpenRouterKeyForm
            autoFocus={isChangingKey}
            onConnected={() => setIsChangingKey(false)}
            onCancel={status === 'connected' ? () => setIsChangingKey(false) : undefined}
          />
        )}
        {status === 'connected' && apiKey && !isChangingKey && (
          <>
            <div className={styles.keyRow}>
              <div className={styles.keyInfo}>
                <span className={sectionStyles.subheading}>Chave da OpenRouter</span>
                <OpenRouterKeyStatus apiKey={apiKey} />
              </div>
              <div className={styles.keyActions}>
                <Button variant="secondary" onClick={() => setIsChangingKey(true)}>
                  Trocar chave
                </Button>
                <Button variant="ghost" onClick={() => void disconnect()}>
                  Remover
                </Button>
              </div>
            </div>
            <FormField
              label="Modelo"
              htmlFor={modelId}
              hint="Automático usa os modelos gratuitos testados com o Dashboard, um de reserva do outro. A lista da OpenRouter muda com frequência."
            >
              <AiModelSelect id={modelId} className={styles.model} />
            </FormField>
          </>
        )}
      </div>
    </section>
  );
}
