import { useId } from 'react';
import { FormField } from '../../../components/FormField';
import { autoTitle } from '../lib/describe';
import { measureOf, schemaOf } from '../lib/schema';
import { useBuilderStore } from '../store/useBuilderStore';
import type { Dataset, VisualConfig, VisualKind, WidgetWidth } from '../types';
import { HeatColorsField } from './HeatColorsField';
import { Segmented } from './Segmented';

interface VisualFormProps {
  nodeId: string;
  kind: VisualKind;
  config: VisualConfig;
  input: Dataset | undefined;
}

const WIDTHS: { value: WidgetWidth; label: string }[] = [
  { value: 'quarter', label: '1/4' },
  { value: 'third', label: '1/3' },
  { value: 'half', label: '1/2' },
  { value: 'full', label: 'Inteira' },
];

/** Configuração de um bloco do dashboard: título, largura e (no Número sem agrupar) o que contar. */
export function VisualForm({ nodeId, kind, config, input }: VisualFormProps) {
  const updateConfig = useBuilderStore((state) => state.updateConfig);
  const update = (patch: Partial<VisualConfig>) => updateConfig<VisualKind>(nodeId, patch);
  const titleId = useId();
  const measureId = useId();
  const schema = input ? schemaOf(input.source) : undefined;
  const showMeasure = kind === 'number' && input?.kind === 'records' && schema;

  return (
    <>
      <FormField label="Título" htmlFor={titleId} hint="Vazio, o título vem do que a peça mostra.">
        <input
          id={titleId}
          className="input"
          value={config.title}
          placeholder={autoTitle(kind, config, input) || 'Título do bloco'}
          maxLength={80}
          onChange={(event) => update({ title: event.target.value })}
        />
      </FormField>
      {showMeasure && (
        <FormField label="Contar" htmlFor={measureId}>
          <select
            id={measureId}
            className="input"
            value={config.measure ?? schema.defaultMeasure}
            onChange={(event) => update({ measure: event.target.value })}
          >
            {schema.measures.map((measure) => (
              <option key={measure.id} value={measure.id}>
                {measure.label}
              </option>
            ))}
          </select>
        </FormField>
      )}
      <FormField label="Largura no dashboard">
        <Segmented label="Largura no dashboard" value={config.width} options={WIDTHS} onChange={(width) => update({ width })} />
      </FormField>
      {kind === 'heatmap' && (
        <HeatColorsField
          value={config.heat}
          // A unidade da medida que chega (horas ou contagem); sem dados ainda, horas.
          unit={input?.kind === 'aggregate' ? measureOf(input.source, input.spec.measure).unit : 'duration'}
          onChange={(heat) => update({ heat })}
        />
      )}
    </>
  );
}
