import { ArrowsLeftRight } from '@phosphor-icons/react';
import { useId, useMemo, useState } from 'react';
import { Button } from '../../../components/Button';
import { FormField } from '../../../components/FormField';
import { distinctValues } from '../lib/datasets';
import { SORT_ORDERS } from '../lib/describe';
import { schemaOf } from '../lib/schema';
import { useBuilderStore } from '../store/useBuilderStore';
import type { Dataset, FilterConfig, GroupConfig, SortConfig, SortOrder, SourceKind } from '../types';
import styles from './InspectorFields.module.css';
import { Segmented } from './Segmented';

interface TransformFormProps<Config> {
  nodeId: string;
  config: Config;
  /** Os dados que chegam na peça (quando já chegaram). */
  input: Dataset | undefined;
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Mais valores que isto: aparece a pesquisa. */
const SEARCH_FROM = 8;

/** Configuração do Filtrar: o campo, os valores (os que existem nos dados que chegam) e se ficam ou saem. */
export function FilterForm({ nodeId, config, input }: TransformFormProps<FilterConfig>) {
  const updateConfig = useBuilderStore((state) => state.updateConfig);
  const update = (patch: Partial<FilterConfig>) => updateConfig<'filter'>(nodeId, patch);
  const fieldId = useId();
  const [search, setSearch] = useState('');
  const dimensions = input ? schemaOf(input.source).dimensions : [];
  const values = useMemo(() => (input && config.field ? distinctValues(input, config.field) : []), [input, config.field]);
  const shown = search ? values.filter(({ value }) => normalize(value.label).includes(normalize(search))) : values;
  const chosen = new Set(config.values);

  function toggle(key: string, label: string) {
    const next = chosen.has(key) ? config.values.filter((value) => value !== key) : [...config.values, key];
    const labels = { ...config.labels, [key]: label };
    // Só ficam os rótulos dos valores escolhidos.
    update({ values: next, labels: Object.fromEntries(next.map((value) => [value, labels[value] ?? value])) });
  }

  return (
    <>
      <FormField
        label="Campo"
        htmlFor={fieldId}
        hint={input ? undefined : 'Ligue a peça a dados para ver os campos e os valores.'}
      >
        <select
          id={fieldId}
          className="input"
          value={config.field ?? ''}
          disabled={!input}
          onChange={(event) => {
            setSearch('');
            update({ field: event.target.value || null, values: [], labels: {} });
          }}
        >
          <option value="">Escolha o campo</option>
          {dimensions.map((dimension) => (
            <option key={dimension.id} value={dimension.id}>
              {dimension.label}
            </option>
          ))}
        </select>
      </FormField>

      {config.field && input && (
        <>
          <FormField label="O que fazer">
            <Segmented
              label="O que fazer"
              value={config.mode}
              options={[
                { value: 'include', label: 'Ficar só com' },
                { value: 'exclude', label: 'Tirar' },
              ]}
              onChange={(mode) => update({ mode })}
            />
          </FormField>

          <div className={styles.values}>
            {values.length > SEARCH_FROM && (
              <input
                type="search"
                className="input"
                placeholder="Pesquisar valores"
                aria-label="Pesquisar valores"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            )}
            <div className={styles.valuesTools}>
              <span>
                {config.values.length} de {values.length} escolhidos
              </span>
              {config.values.length > 0 && (
                <button type="button" className={styles.linkButton} onClick={() => update({ values: [], labels: {} })}>
                  Limpar
                </button>
              )}
            </div>
            <div className={styles.valueList} role="group" aria-label="Valores">
              {shown.length === 0 && <p className={styles.emptyValues}>Nenhum valor com essa pesquisa.</p>}
              {shown.map(({ value, count }) => (
                <label key={value.key} className={styles.valueItem}>
                  <input type="checkbox" checked={chosen.has(value.key)} onChange={() => toggle(value.key, value.label)} />
                  <span className={styles.valueLabel} title={value.label}>
                    {value.label}
                  </span>
                  <span className={styles.valueCount}>{count}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

/** Configuração do Agrupar e cruzar: por qual campo, cruzado com qual, e o que medir. */
export function GroupForm({
  nodeId,
  config,
  input,
  source: graphSource,
}: TransformFormProps<GroupConfig> & { source: SourceKind | undefined }) {
  const updateConfig = useBuilderStore((state) => state.updateConfig);
  const update = (patch: Partial<GroupConfig>) => updateConfig<'group'>(nodeId, patch);
  const byId = useId();
  const seriesId = useId();
  const measureId = useId();
  // A fonte pela montagem; sem nenhuma ligada, os campos das horas lançadas (a fonte mais comum).
  const source: SourceKind = graphSource ?? input?.source ?? 'worklogs';
  const schema = schemaOf(source);
  const measure = schema.measures.find((item) => item.id === config.measure) ?? schema.measures.find((item) => item.id === schema.defaultMeasure)!;

  return (
    <>
      <FormField label="Medir" htmlFor={measureId}>
        <select id={measureId} className="input" value={measure.id} onChange={(event) => update({ measure: event.target.value })}>
          {schema.measures.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </FormField>
      <div className={styles.row}>
        <FormField label="Agrupar por" htmlFor={byId}>
          <select id={byId} className="input" value={config.by ?? ''} onChange={(event) => update({ by: event.target.value || null })}>
            <option value="">Nada (só o total)</option>
            {schema.dimensions.map((dimension) => (
              <option key={dimension.id} value={dimension.id} disabled={dimension.id === config.series}>
                {dimension.label}
              </option>
            ))}
          </select>
        </FormField>
        <Button
          variant="secondary"
          className={styles.swap}
          icon={<ArrowsLeftRight size={14} weight="bold" aria-hidden />}
          aria-label="Trocar os dois campos"
          title="Trocar: as linhas viram o cruzamento e vice-versa"
          disabled={!config.by || !config.series}
          onClick={() => update({ by: config.series, series: config.by })}
        />
      </div>
      <FormField
        label="Cruzar com (opcional)"
        htmlFor={seriesId}
        hint="Divide cada grupo por um segundo campo: vira as cores das barras ou as colunas do mapa de calor."
      >
        <select
          id={seriesId}
          className="input"
          value={config.series ?? ''}
          disabled={!config.by}
          onChange={(event) => update({ series: event.target.value || null })}
        >
          <option value="">Nada</option>
          {schema.dimensions.map((dimension) => (
            <option key={dimension.id} value={dimension.id} disabled={dimension.id === config.by}>
              {dimension.label}
            </option>
          ))}
        </select>
      </FormField>
      {(config.by === 'personSquad' || config.series === 'personSquad') && (
        <p className={styles.valuesTools}>
          "Squad da pessoa" é a squad em que ela mais lançou horas nos dados da peça: com todas as squads, mostra onde a
          pessoa trabalha, mesmo com horas em projetos de reunião.
        </p>
      )}
      {!measure.additive && config.series && (
        <p className={styles.valuesTools}>
          "{measure.label}" não soma entre as partes: numa barra cruzada, os pedaços podem passar do total do grupo.
        </p>
      )}
    </>
  );
}

const LIMITS = [3, 5, 8, 10, 15, 20, 30, 50];

/** Configuração do Ordenar: a ordem, quantos grupos ficam e o "Outros". */
export function SortForm({ nodeId, config }: TransformFormProps<SortConfig>) {
  const updateConfig = useBuilderStore((state) => state.updateConfig);
  const update = (patch: Partial<SortConfig>) => updateConfig<'sort'>(nodeId, patch);
  const orderId = useId();
  const limitId = useId();

  return (
    <>
      <FormField label="Ordem" htmlFor={orderId}>
        <select id={orderId} className="input" value={config.order} onChange={(event) => update({ order: event.target.value as SortOrder })}>
          {SORT_ORDERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Mostrar" htmlFor={limitId}>
        <select
          id={limitId}
          className="input"
          value={config.limit ?? ''}
          onChange={(event) => update({ limit: event.target.value ? Number(event.target.value) : null })}
        >
          <option value="">Todos os grupos</option>
          {LIMITS.map((limit) => (
            <option key={limit} value={limit}>
              Só os {limit} primeiros
            </option>
          ))}
        </select>
      </FormField>
      <label className={styles.checkbox} aria-disabled={config.limit === null}>
        <input
          type="checkbox"
          checked={config.others}
          disabled={config.limit === null}
          onChange={(event) => update({ others: event.target.checked })}
        />
        Juntar o resto em "Outros"
      </label>
    </>
  );
}
