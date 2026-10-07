import { ArrowClockwise, CaretRight, CheckCircle, CircleNotch, LockSimple, Sparkle, X } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { type CreatedIssue, type CreateField, type IssueTypeOption, projectKeyOf } from '../api/jira-issues';
import type { JiraUser } from '../api/jira-users';
import { OpenRouterError } from '../api/openrouter';
import { jiraKeys } from '../api/queryKeys';
import { useCreatableIssueTypesQuery } from '../api/useCreatableIssueTypesQuery';
import { describeCreateIssueError, useCreateChildIssueMutation } from '../api/useCreateChildIssueMutation';
import { useCreateFieldsQuery } from '../api/useCreateFieldsQuery';
import { useCurrentUserQuery } from '../api/useCurrentUserQuery';
import { useSuggestSubtasksMutation } from '../api/useSuggestSubtasksMutation';
import { formatDuration } from '../lib/formatDuration';
import {
  activityOptions,
  type ChildDraft,
  draftToNewIssue,
  emptyDraft,
  findActivityFields,
  validateDraft,
} from '../lib/subtaskDraft';
import { useOpenRouterStore } from '../store/useOpenRouterStore';
import styles from './AiSubtaskSuggestions.module.css';
import { Button } from './Button';
import { ChildIssueFields } from './ChildIssueFields';
import { MultiSelect } from './MultiSelect';
import { Notice } from './Notice';
import { OpenRouterKeyForm } from './OpenRouterKeyForm';

interface AiSubtaskSuggestionsProps {
  parentKey: string;
  parentType: string;
  summary: string;
  /** Descrição da história em texto simples; `undefined` enquanto os detalhes carregam. */
  description: string | undefined;
  originalEstimateSeconds?: number;
  /** Títulos das subtarefas que já existem; `undefined` enquanto carregam. */
  existing: string[] | undefined;
  /** Responsável que já vem escolhido em cada sugestão (o da história). */
  defaultAssignee?: JiraUser | null;
  onClose: () => void;
}

type ItemState = 'idle' | 'creating' | 'created' | 'error';

interface SuggestionItem {
  uid: number;
  draft: ChildDraft;
  state: ItemState;
  created?: CreatedIssue;
  error?: string;
  showErrors: boolean;
  /** Accordion aberto: os campos aparecem (abre sozinho com erro). */
  open: boolean;
}

interface TypeOption {
  value: string;
  label: string;
}

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

interface SuggestionCardProps {
  index: number;
  item: SuggestionItem;
  projectKey: string;
  types: IssueTypeOption[];
  onChange: (patch: Partial<ChildDraft>) => void;
  onToggle: () => void;
  onCreate: () => void;
  onDiscard: () => void;
  isBusy: boolean;
}

/**
 * Uma sugestão, num accordion: fechada, só o título (com a estimativa, o tipo
 * de atividade e a atividade); aberta, os campos para conferir e ajustar e "Criar". Criada, vira uma linha.
 */
function SuggestionCard({ index, item, projectKey, types, onChange, onToggle, onCreate, onDiscard, isBusy }: SuggestionCardProps) {
  const panelId = useId();
  const fieldsQuery = useCreateFieldsQuery(projectKey, item.draft.issueTypeId || undefined);
  const fields = fieldsQuery.data;

  if (item.state === 'created' && item.created) {
    return (
      <li className={styles.createdRow}>
        <CheckCircle size={16} weight="fill" className={styles.createdIcon} aria-hidden />
        <span>
          <strong>{item.created.key}</strong> criada: {item.draft.summary}
          {item.created.skipped.length > 0 && (
            <span className={styles.skipped}> (o Jira não aceitou {item.created.skipped.join(', ')})</span>
          )}
        </span>
      </li>
    );
  }

  const activity = findActivityFields(fields);
  const activityName =
    activityOptions(activity, item.draft.activityTypeId).find((option) => option.id === item.draft.activityId)?.value ??
    (activity.activity?.kind === 'text' ? item.draft.activityId : '');
  const typeName =
    activity.type?.options.find((option) => option.id === item.draft.activityTypeId)?.value ??
    (activity.type?.kind === 'text' ? item.draft.activityTypeId : '');
  const meta = [item.draft.estimate, typeName, activityName].filter(Boolean).join(' · ');

  return (
    <li className={styles.card} data-open={item.open || undefined} data-error={item.state === 'error' || undefined}>
      <div className={styles.cardHeader}>
        <button type="button" className={styles.toggle} aria-expanded={item.open} aria-controls={panelId} onClick={onToggle}>
          <CaretRight size={14} weight="bold" className={styles.caret} aria-hidden />
          <span className={styles.cardSummary}>{item.draft.summary.trim() || `Sugestão ${index + 1} (sem título)`}</span>
          {meta && <span className={styles.cardMeta}>{meta}</span>}
        </button>
        <Button
          variant="ghost"
          className={styles.discard}
          icon={<X size={14} weight="bold" aria-hidden />}
          aria-label={`Descartar "${item.draft.summary || `sugestão ${index + 1}`}"`}
          title="Descartar"
          onClick={onDiscard}
          disabled={item.state === 'creating'}
        />
      </div>
      {item.open && (
        <div id={panelId} className={styles.cardBody}>
          <ChildIssueFields
            projectKey={projectKey}
            draft={item.draft}
            onChange={onChange}
            types={types}
            fields={fields}
            errors={item.showErrors ? validateDraft(item.draft, fields) : undefined}
            disabled={item.state === 'creating'}
            noun="subtarefa"
          />
          {item.error && <Notice tone="error">{item.error}</Notice>}
          <div className={styles.cardActions}>
            <Button
              variant="secondary"
              onClick={onCreate}
              disabled={isBusy || item.state === 'creating' || !(fieldsQuery.isSuccess || fieldsQuery.isError)}
            >
              {item.state === 'creating' ? 'Criando…' : 'Criar esta subtarefa'}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Subtarefas sugeridas pela IA para a história (OpenRouter, direto do
 * navegador), cada uma com todos os campos para conferir e ajustar antes de
 * criar. Vão para a IA a história (título, descrição, estimativa), os títulos
 * das subtarefas que já existem e as opções de atividade do Jira; nomes de pessoas não.
 */
export function AiSubtaskSuggestions({
  parentKey,
  parentType,
  summary,
  description,
  originalEstimateSeconds,
  existing,
  defaultAssignee = null,
  onClose,
}: AiSubtaskSuggestionsProps) {
  const guidanceId = useId();
  const typesId = useId();
  const projectKey = projectKeyOf(parentKey);
  const queryClient = useQueryClient();
  const status = useOpenRouterStore((state) => state.status);
  const typesQuery = useCreatableIssueTypesQuery(projectKey, true);
  const types = (typesQuery.data ?? []).filter((type) => type.hierarchyLevel === -1);
  const defaultTypeId = types[0]?.id;
  const fieldsQuery = useCreateFieldsQuery(projectKey, defaultTypeId);
  const { data: me } = useCurrentUserQuery();
  const suggest = useSuggestSubtasksMutation();
  const { mutate: requestSuggestions, reset: resetSuggestions } = suggest;
  const create = useCreateChildIssueMutation();
  const elapsed = useElapsedSeconds(suggest.isPending);
  const [items, setItems] = useState<SuggestionItem[]>([]);
  const [guidance, setGuidance] = useState('');
  /** Os tipos de atividade escolhidos antes de pedir (ids das opções do Jira). */
  const [chosenTypeIds, setChosenTypeIds] = useState<string[]>([]);
  const [isChangingKey, setIsChangingKey] = useState(false);
  const [isCreatingAll, setIsCreatingAll] = useState(false);
  const [model, setModel] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const nextUid = useRef(1);

  // Pronto para pedir: a história, as subtarefas que existem e a tela de criação (as opções de atividade).
  const isContextReady =
    description !== undefined && existing !== undefined && Boolean(defaultTypeId) && (fieldsQuery.isSuccess || fieldsQuery.isError);
  const error = suggest.error && !isAbort(suggest.error) ? suggest.error : null;
  const activityFields = findActivityFields(fieldsQuery.data);
  const typeChoices = activityFields.type?.options ?? [];
  const chosenTypes = typeChoices.filter((option) => chosenTypeIds.includes(option.id));
  // Sem tipos de atividade no Jira (campo ausente ou de texto), dá para pedir sem escolher.
  const needsType = typeChoices.length > 0 && chosenTypes.length === 0;
  const typeOptions = typeChoices.map((option): TypeOption => ({ value: option.id, label: option.value }));
  const typeLabel = activityFields.type?.name ?? 'Tipo de atividade';

  const run = useCallback(() => {
    if (!defaultTypeId || description === undefined || existing === undefined || needsType) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const context = {
      parentKey,
      parentType,
      summary,
      description,
      estimate: originalEstimateSeconds ? formatDuration(originalEstimateSeconds, 'hours-minutes') : '',
      // As que já existem e as já criadas aqui: a IA não repete.
      existing,
      activity: activityFields,
      chosenTypes,
      guidance,
    };
    requestSuggestions(
      { context, signal: controller.signal },
      {
        onSuccess: (result) => {
          if (controller.signal.aborted) return;
          setModel(result.model);
          setItems((previous) => [
            // As criadas continuam listadas; as outras dão lugar às novas.
            ...previous.filter((item) => item.state === 'created'),
            ...result.suggestions.map((suggestion) => ({
              uid: nextUid.current++,
              draft: emptyDraft({ ...suggestion, issueTypeId: defaultTypeId, reporter: me ?? null, assignee: defaultAssignee }),
              state: 'idle' as const,
              showErrors: false,
              open: false,
            })),
          ]);
        },
      },
    );
  }, [defaultTypeId, description, existing, needsType, parentKey, parentType, summary, originalEstimateSeconds, activityFields, chosenTypes, guidance, requestSuggestions, me, defaultAssignee]);

  // Fechar as sugestões no meio do pedido cancela ele.
  useEffect(() => () => abortRef.current?.abort(), []);

  function patchItem(uid: number, patch: Partial<SuggestionItem>) {
    setItems((previous) => previous.map((item) => (item.uid === uid ? { ...item, ...patch } : item)));
  }

  /** Cria uma sugestão; `false` se faltar algo ou o Jira recusar. */
  async function createItem(item: SuggestionItem): Promise<boolean> {
    const fields = queryClient.getQueryData<CreateField[]>(jiraKeys.createFields(projectKey, item.draft.issueTypeId));
    if (Object.keys(validateDraft(item.draft, fields)).length > 0) {
      // Abre o accordion: os erros aparecem nos campos.
      patchItem(item.uid, { showErrors: true, state: 'idle', open: true });
      return false;
    }
    patchItem(item.uid, { state: 'creating', error: undefined });
    try {
      const created = await create.mutateAsync({ parentKey, input: draftToNewIssue(item.draft, fields, me?.accountId) });
      patchItem(item.uid, { state: 'created', created });
      return true;
    } catch (createError) {
      patchItem(item.uid, { state: 'error', error: describeCreateIssueError(createError as Error), open: true });
      return false;
    }
  }

  // Uma de cada vez, na ordem: a lista de subtarefas e o Jira acompanham.
  async function createAll() {
    setIsCreatingAll(true);
    for (const item of items.filter((candidate) => candidate.state !== 'created')) await createItem(item);
    setIsCreatingAll(false);
  }

  function cancel() {
    abortRef.current?.abort();
    resetSuggestions();
  }

  const pending = items.filter((item) => item.state !== 'created');
  const isBusy = isCreatingAll || items.some((item) => item.state === 'creating');

  const canRequest = isContextReady && !needsType && !suggest.isPending && !isBusy;
  /** O pedido: os tipos de atividade (obrigatórios quando o Jira tem a lista), a orientação e o botão. */
  const request = (
    <div className={styles.request}>
      {typeOptions.length > 0 && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor={typesId}>
            {typeLabel}
          </label>
          <MultiSelect<TypeOption>
            inputId={typesId}
            placeholder="Escolha um ou mais tipos"
            options={typeOptions}
            value={typeOptions.filter((option) => chosenTypeIds.includes(option.value))}
            onChange={(selected) => setChosenTypeIds(selected.map((option) => option.value))}
            isDisabled={suggest.isPending}
            // Dentro do modal: um menu no <body> ficaria atrás dele.
            menuPortalTarget={null}
            menuPlacement="auto"
          />
          <p className={styles.hint}>A IA cria as subtarefas só nos tipos escolhidos e escolhe a atividade de cada uma.</p>
        </div>
      )}
      <div className={styles.field}>
        <label className={styles.label} htmlFor={guidanceId}>
          Orientação para a IA (opcional)
        </label>
        <input
          id={guidanceId}
          className="input"
          value={guidance}
          maxLength={500}
          placeholder="Ex: separe front e back, inclua testes"
          onChange={(event) => setGuidance(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (canRequest) run();
            }
          }}
          disabled={suggest.isPending}
        />
      </div>
      <div className={styles.requestActions}>
        <Button
          variant={items.length > 0 ? 'secondary' : 'primary'}
          icon={
            items.length > 0 ? <ArrowClockwise size={14} weight="bold" aria-hidden /> : <Sparkle size={14} weight="fill" aria-hidden />
          }
          onClick={run}
          disabled={!canRequest}
          title={needsType ? `Escolha ao menos um ${typeLabel.toLowerCase()}` : undefined}
        >
          {items.length > 0 ? 'Sugerir de novo' : 'Gerar sugestões'}
        </Button>
      </div>
    </div>
  );

  let body;
  if (status === 'loading') {
    body = <p className={styles.muted}>Carregando…</p>;
  } else if (status === 'disconnected' || isChangingKey) {
    body = (
      <>
        {!isChangingKey && (
          <p className={styles.text}>
            As sugestões usam a IA da OpenRouter, que tem modelos gratuitos. Cadastre a sua chave uma vez; ela fica salva neste
            navegador.
          </p>
        )}
        <OpenRouterKeyForm
          autoFocus
          onConnected={() => setIsChangingKey(false)}
          onCancel={status === 'connected' ? () => setIsChangingKey(false) : undefined}
        />
      </>
    );
  } else if (typesQuery.isSuccess && types.length === 0) {
    body = <Notice tone="warning">Sua conta não pode criar subtarefas no projeto {projectKey}.</Notice>;
  } else {
    body = (
      <>
        {suggest.isPending ? (
          <div className={styles.progress} role="status">
            <CircleNotch size={16} weight="bold" className={styles.spinner} aria-hidden />
            <span>
              A IA está lendo a história… {elapsed}s
              {elapsed >= 20 && <span className={styles.muted}> Modelos gratuitos podem levar até um minuto.</span>}
            </span>
            <Button variant="secondary" className={styles.small} onClick={cancel}>
              Cancelar
            </Button>
          </div>
        ) : !isContextReady && !error ? (
          <p className={styles.progress} role="status">
            <CircleNotch size={16} weight="bold" className={styles.spinner} aria-hidden />
            Lendo a história e os campos do Jira…
          </p>
        ) : null}

        {fieldsQuery.isError && (
          <Notice tone="warning">
            Não foi possível ler a tela de criação do projeto ({fieldsQuery.error.message}): as sugestões vêm sem tipo de
            atividade e atividade.
          </Notice>
        )}
        {error && (
          <div className={styles.error}>
            <Notice tone="error">{error.message}</Notice>
            {error instanceof OpenRouterError && error.problem === 'invalid-key' && (
              <Button variant="secondary" className={styles.small} onClick={() => setIsChangingKey(true)}>
                Trocar chave
              </Button>
            )}
          </div>
        )}

        {items.length === 0 && request}

        {items.length > 0 && (
          <ul className={styles.list} aria-label="Subtarefas sugeridas">
            {items.map((item, index) => (
              <SuggestionCard
                key={item.uid}
                index={index}
                item={item}
                projectKey={projectKey}
                types={types}
                isBusy={isCreatingAll}
                onChange={(patch) =>
                  setItems((previous) =>
                    previous.map((other) => (other.uid === item.uid ? { ...other, draft: { ...other.draft, ...patch } } : other)),
                  )
                }
                onToggle={() => patchItem(item.uid, { open: !item.open })}
                onCreate={() => void createItem(item)}
                onDiscard={() => setItems((previous) => previous.filter((other) => other.uid !== item.uid))}
              />
            ))}
          </ul>
        )}
        {suggest.isSuccess && pending.length === 0 && items.length > 0 && (
          <Notice tone="success">Todas as sugestões foram criadas. Peça outras ou feche.</Notice>
        )}

        {items.length > 0 && request}

        <p className={styles.privacy}>
          <LockSimple size={13} weight="bold" aria-hidden />
          <span>
            Vão para a IA o título, a descrição e a estimativa da história, os títulos das subtarefas que já existem, os tipos
            de atividade escolhidos e as atividades do Jira. Nomes de pessoas não vão.
            {model && ` Modelo: ${model}.`}
          </span>
        </p>
      </>
    );
  }

  return (
    <div
      className={styles.panel}
      onKeyDown={(event) => {
        // Esc fecha só as sugestões (sem isto, fecharia o modal); com uma lista aberta, ela trata o Esc.
        if (event.key === 'Escape' && !event.defaultPrevented && !isBusy) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className={styles.header}>
        <span className={styles.title}>
          <Sparkle size={15} weight="fill" className={styles.titleIcon} aria-hidden />
          Subtarefas sugeridas pela IA
        </span>
        <div className={styles.headerActions}>
          {pending.length > 1 && status === 'connected' && !isChangingKey && (
            <Button variant="primary" className={styles.small} onClick={() => void createAll()} disabled={isBusy || suggest.isPending}>
              {isCreatingAll ? 'Criando…' : `Criar todas (${pending.length})`}
            </Button>
          )}
          <Button variant="ghost" className={styles.small} onClick={onClose} disabled={isBusy}>
            Fechar
          </Button>
        </div>
      </div>
      {body}
    </div>
  );
}
