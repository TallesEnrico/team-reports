import { AUTO_AI_MODEL } from '../api/openrouter';
import { useFreeAiModelsQuery } from '../api/useFreeAiModelsQuery';
import { useOpenRouterStore } from '../store/useOpenRouterStore';

interface AiModelSelectProps {
  id: string;
  disabled?: boolean;
  className?: string;
}

/**
 * O modelo da IA: "Automático" (os gratuitos testados com o Dashboard, um de
 * reserva do outro) ou um dos modelos gratuitos da OpenRouter no momento.
 */
export function AiModelSelect({ id, disabled, className }: AiModelSelectProps) {
  const model = useOpenRouterStore((state) => state.model);
  const setModel = useOpenRouterStore((state) => state.setModel);
  const models = useFreeAiModelsQuery();
  const list = models.data ?? [];
  const isMissing = model !== AUTO_AI_MODEL && models.isSuccess && !list.some((item) => item.id === model);

  return (
    <select
      id={id}
      className={className ? `input ${className}` : 'input'}
      value={model}
      disabled={disabled}
      onChange={(event) => void setModel(event.target.value)}
    >
      <option value={AUTO_AI_MODEL}>Automático (recomendado)</option>
      {/* O escolhido saiu da lista da OpenRouter: continua aparecendo, para a pessoa trocar. */}
      {isMissing && <option value={model}>{model} (indisponível)</option>}
      {model !== AUTO_AI_MODEL && !models.isSuccess && <option value={model}>{model}</option>}
      {list.length > 0 && (
        <optgroup label="Modelos gratuitos">
          {list.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name.replace(/\s*\(free\)$/i, '')}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
