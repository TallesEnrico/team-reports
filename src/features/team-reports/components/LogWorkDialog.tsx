import { CaretRight, CircleNotch, Info, MagnifyingGlass } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState } from 'react';
import { useLogWorkSettingsStore } from '@/store/useLogWorkSettingsStore';
import { type JiraIssue, ownTimeTotals } from '../../../api/jira-issues';
import type { WorklogInput } from '../../../api/jira-worklogs';
import { useIssueDetailsQuery } from '../../../api/useIssueDetailsQuery';
import { useJiraWriteAccess } from '../../../api/useJiraWriteAccessQuery';
import { describeLogWorkError, useLogWorkMutation } from '../../../api/useLogWorkMutation';
import { Button } from '../../../components/Button';
import { DayTimeline } from '../../../components/DayTimeline';
import { FormField } from '../../../components/FormField';
import { Modal } from '../../../components/Modal';
import { Notice, ReadOnlyNotice } from '../../../components/Notice';
import { StatusLozenge } from '../../../components/StatusLozenge';
import { StatusPicker } from '../../../components/StatusPicker';
import { TimeTracking } from '../../../components/TimeTracking';
import { WorklogForm } from '../../../components/WorklogForm';
import { type DateKey, formatDateBR, toDateKeyInTimeZone } from '../../../lib/dates';
import { formatDuration } from '../../../lib/formatDuration';
import type { ReportTimeZone } from '../../../lib/timeZones';
import { buildNewWorklog, emptyWorklogFormValues, formDurationSeconds } from '../../../lib/worklogForm';
import { ISSUES_TO_LOG_LIMIT } from '../api/issues-to-log-api';
import { useIssuesToLogQuery } from '../api/useIssuesToLogQuery';
import type { LogWorkIssueSeed } from '../store/useLogWorkDialogStore';
import styles from './LogWorkDialog.module.css';

/** Até quantas tarefas a lista mostra de uma vez; a pesquisa acha as demais. */
const MAX_SHOWN = 50;

interface LogWorkDialogProps {
  /** Fuso do relatório: data e horários do lançamento usam o mesmo. */
  timeZone: ReportTimeZone;
  /** Tarefa da célula ou do cronômetro: o formulário abre nela, sem passar pela lista. */
  initialIssue?: LogWorkIssueSeed;
  /** Dia da célula ou do cronômetro. */
  initialDate?: DateKey;
  /** Horário de início vindo do cronômetro (HH:mm). */
  initialStart?: string;
  /** Horário de fim vindo do cronômetro (HH:mm). */
  initialEnd?: string;
  /** Descrição vinda do cronômetro. */
  initialComment?: string;
  onClose: () => void;
}

function reportIssueToLogIssue(issue: LogWorkIssueSeed): JiraIssue {
  return {
    id: issue.id ?? '',
    key: issue.key,
    summary: issue.summary,
    status: { id: '', name: issue.status?.name ?? '', categoryKey: issue.status?.categoryKey },
    issueType: {
      id: '',
      name: issue.issueType?.name ?? '',
      iconUrl: issue.issueType?.iconUrl,
      hierarchyLevel: 0,
    },
    parent: issue.parent
      ? { id: issue.parent.id, key: issue.parent.key, summary: issue.parent.summary, iconUrl: issue.parent.iconUrl }
      : undefined,
    timeSpentSeconds: 0,
  };
}

function IssueSummary({ issue }: { issue: JiraIssue }) {
  return (
    <>
      {issue.issueType.iconUrl && <img src={issue.issueType.iconUrl} alt="" width={16} height={16} />}
      <span className={styles.key}>{issue.key}</span>
      <span className={styles.summary}>{issue.summary}</span>
      <StatusLozenge status={issue.status} />
    </>
  );
}

/** Lançar horas de qualquer tela do relatório: escolher a tarefa e informar data, horário e descrição. */
export function LogWorkDialog({
  timeZone,
  initialIssue,
  initialDate,
  initialStart,
  initialEnd,
  initialComment,
  onClose,
}: LogWorkDialogProps) {
  const titleId = useId();
  const searchId = useId();
  const closeOnSuccess = useLogWorkSettingsStore((state) => state.closeOnSuccess);
  const setCloseOnSuccess = useLogWorkSettingsStore((state) => state.setCloseOnSuccess);
  const { canWrite, isReadOnly } = useJiraWriteAccess();
  const logWork = useLogWorkMutation();
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<JiraIssue | null>(() => (initialIssue ? reportIssueToLogIssue(initialIssue) : null));
  /** Aviso do último lançamento, acima do formulário (sai ao trocar de tarefa ou lançar de novo). */
  const [logged, setLogged] = useState<string | null>(null);
  /**
   * Depois de lançar, o formulário recomeça (nova `key`) com a mesma data e o
   * início, o fim e a descrição vazios, para o próximo horário na mesma tarefa.
   */
  const [form, setForm] = useState<{ key: number; date: DateKey | null; prefill: boolean }>(() => ({
    key: 0,
    date: initialDate ?? null,
    prefill: Boolean(initialStart || initialEnd || initialComment),
  }));
  /** Duração do lançamento em edição (início e fim preenchidos), para o "Com este" do controle de tempo. */
  const [draftSeconds, setDraftSeconds] = useState<number | null>(() => {
    const seconds = formDurationSeconds({ start: initialStart ?? '', end: initialEnd ?? '' });
    return seconds !== null && seconds > 0 ? seconds : null;
  });
  const searchRef = useRef<HTMLInputElement>(null);

  const isPicking = !isReadOnly && !selected;
  // Foco na pesquisa ao abrir e ao voltar para a lista (o <dialog> focaria o botão de fechar).
  useEffect(() => {
    if (isPicking) searchRef.current?.focus();
  }, [isPicking]);
  useEffect(() => {
    if (isPicking || isReadOnly || !form.date) return;
    document.getElementById(titleId)?.closest('dialog')?.querySelector<HTMLInputElement>('input[type="time"]')?.focus();
  }, [isPicking, isReadOnly, form.date, form.key, titleId]);
  const search = useIssuesToLogQuery(term, isPicking);
  const isSearching = term.trim() !== '';
  const issues = search.data?.issues ?? [];
  const shown = issues.slice(0, MAX_SHOWN);
  const hiddenParents = search.data?.hiddenParents ?? 0;
  // Descrição da tarefa escolhida (no accordion), buscada ao escolher.
  const detailsQuery = useIssueDetailsQuery(selected?.key ?? '', selected !== null);

  useEffect(() => {
    const details = detailsQuery.data;
    if (!details) return;
    setSelected((current) => {
      if (!current || current.key !== details.key || current.status.id !== '') return current;
      return details;
    });
  }, [detailsQuery.data]);

  function choose(issue: JiraIssue | null) {
    logWork.reset();
    setLogged(null);
    setForm((current) => ({ key: current.key + 1, date: initialDate ? current.date : null, prefill: false }));
    setDraftSeconds(null);
    setSelected(issue);
  }

  async function handleSubmit(issue: JiraIssue, input: WorklogInput | null) {
    if (!input) return;
    setLogged(null);
    try {
      await logWork.mutateAsync({ issue, input });
      if (useLogWorkSettingsStore.getState().closeOnSuccess) {
        onClose();
        return;
      }
      const day = toDateKeyInTimeZone(input.started, timeZone);
      setLogged(
        `Lançadas ${formatDuration(input.seconds, 'hours-minutes')} em ${issue.key} no dia ${formatDateBR(day)}. O relatório é atualizado com as horas novas.`,
      );
      // Mesma tarefa e mesma data; início, fim e descrição limpos.
      setForm((current) => ({ key: current.key + 1, date: day, prefill: false }));
      setDraftSeconds(null);
    } catch {
      // O erro aparece no formulário (logWork.error).
    }
  }

  const emptyValues = emptyWorklogFormValues(timeZone);
  const formValues = form.prefill
    ? {
        date: form.date ?? emptyValues.date,
        start: initialStart ?? '',
        end: initialEnd ?? '',
        comment: initialComment ?? '',
      }
    : form.date
      ? { ...emptyValues, date: form.date }
      : emptyValues;

  const header = (
    <>
      <h2 id={titleId} className={styles.title}>
        Lançar horas
        <span className={styles.lead}>
          {selected ? 'Informe a data, o horário e a descrição.' : 'Escolha a tarefa e informe a data, o horário e a descrição.'}
        </span>
      </h2>
    </>
  );

  let body;
  if (isReadOnly) {
    body = <ReadOnlyNotice action="lançar horas" />;
  } else if (selected) {
    body = (
      <>
        <section className={styles.selected} aria-label="Tarefa escolhida">
          <div className={styles.selectedHeader}>
            {selected.issueType.iconUrl && <img src={selected.issueType.iconUrl} alt="" width={16} height={16} />}
            <span className={styles.key}>{selected.key}</span>
            {/* O mesmo seletor do modal da issue: a troca aparece na lista e nos cards do Kanban em cache. */}
            <div className={styles.statusSlot}>
              <StatusPicker issue={selected} canChange={canWrite && selected.id !== ''} onChanged={setSelected} />
            </div>
            <Button variant="ghost" className={styles.changeButton} onClick={() => choose(null)} disabled={logWork.isPending}>
              Trocar
            </Button>
          </div>
          {/* Título inteiro (na lista ele é cortado). */}
          <p className={styles.selectedSummary}>{selected.summary}</p>
          {/* Como no modal da issue; os detalhes (buscados ao escolher) trazem os números mais recentes. */}
          <TimeTracking
            size="compact"
            totals={ownTimeTotals(detailsQuery.data ?? selected)}
            draftSeconds={draftSeconds}
            className={styles.time}
          />
          <details className={styles.description}>
            <summary>
              <CaretRight size={12} weight="bold" className={styles.caret} aria-hidden />
              Descrição
            </summary>
            {/* O painel corta o conteúdo enquanto a altura anima (ver o CSS). */}
            <div className={styles.descriptionPanel}>
              <div className={styles.descriptionBody}>
                {detailsQuery.isPending ? (
                  <p className={styles.loading}>
                    <CircleNotch size={14} weight="bold" className={styles.spinner} aria-hidden /> Carregando…
                  </p>
                ) : detailsQuery.isError ? (
                  <Notice tone="error">Não foi possível carregar a descrição: {detailsQuery.error.message}</Notice>
                ) : detailsQuery.data.description ? (
                  <p className={styles.descriptionText}>{detailsQuery.data.description}</p>
                ) : (
                  <p className={styles.empty}>Sem descrição</p>
                )}
              </div>
            </div>
          </details>
        </section>
        {selected.id === '' &&
          (detailsQuery.isError ? (
            <Notice tone="error">Não foi possível carregar a tarefa: {detailsQuery.error.message}</Notice>
          ) : (
            <p className={styles.loading}>
              <CircleNotch size={14} weight="bold" className={styles.spinner} aria-hidden /> Carregando a tarefa…
            </p>
          ))}
        {logged && <Notice tone="success">{logged}</Notice>}
        <WorklogForm
          closeOnSuccess={closeOnSuccess}
          setCloseOnSuccess={setCloseOnSuccess}
          key={form.key}
          initialValues={formValues}
          autoFocusField={form.date ? 'start' : 'date'}
          onValuesChange={(values) => {
            const seconds = formDurationSeconds(values);
            setDraftSeconds(seconds !== null && seconds > 0 ? seconds : null);
          }}
          renderAfterTimes={(values) => (
            <DayTimeline date={values.date} start={values.start} end={values.end} timeZone={timeZone} />
          )}
          validate={(values) => buildNewWorklog(values, timeZone)}
          timeZone={timeZone}
          timeFormat="hours-minutes"
          submitLabel="Lançar"
          isSaving={logWork.isPending}
          isSubmitDisabled={selected.id === ''}
          saveError={logWork.error ? describeLogWorkError(logWork.error) : null}
          onSubmit={(input) => {
            if (!selected.id) return;
            void handleSubmit(selected, input);
          }}
          onCancel={onClose}
        />
      </>
    );
  } else {
    let results;
    if (search.isPending) {
      results = (
        <p className={styles.loading}>
          <CircleNotch size={14} weight="bold" className={styles.spinner} aria-hidden /> Buscando tarefas…
        </p>
      );
    } else if (search.isError) {
      results = <Notice tone="error">Não foi possível buscar as tarefas: {search.error.message}</Notice>;
    } else if (issues.length === 0) {
      results = (
        <p className={styles.empty}>
          {isSearching ? 'Nenhuma tarefa aberta sua com esse número, chave ou resumo.' : 'Nenhuma tarefa aberta atribuída a você.'}
        </p>
      );
    } else {
      results = (
        <ul className={styles.list} aria-busy={search.isFetching}>
          {shown.map((issue) => (
            <li key={issue.id}>
              <button type="button" className={styles.option} onClick={() => choose(issue)}>
                <IssueSummary issue={issue} />
              </button>
            </li>
          ))}
        </ul>
      );
    }

    body = (
      <>
        <FormField label="Tarefa" htmlFor={searchId}>
          <div className={styles.search}>
            <MagnifyingGlass size={16} weight="bold" className={styles.searchIcon} aria-hidden />
            <input
              ref={searchRef}
              id={searchId}
              className={`input ${styles.searchInput}`}
              type="search"
              placeholder="Número, chave ou resumo (ex: 5151)"
              autoComplete="off"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
            />
          </div>
        </FormField>
        <section className={styles.results} aria-label="Tarefas">
          <p className={styles.resultsTitle}>
            {isSearching ? 'Suas tarefas abertas na pesquisa' : 'Suas tarefas abertas'}
            {search.isFetching && !search.isPending && (
              <CircleNotch size={12} weight="bold" className={styles.spinner} aria-label="Atualizando" />
            )}
          </p>
          {results}
          {issues.length > shown.length && (
            <p className={styles.hint}>
              <Info size={14} weight="bold" aria-hidden />
              Mostrando {shown.length} de {issues.length}: pesquise para achar as demais.
            </p>
          )}
          {search.data?.isTruncated && (
            <p className={styles.hint}>
              <Info size={14} weight="bold" aria-hidden />
              Você tem mais de {ISSUES_TO_LOG_LIMIT} tarefas abertas: a lista usa as {ISSUES_TO_LOG_LIMIT} atualizadas mais
              recentemente.
            </p>
          )}
          {hiddenParents > 0 && (
            <p className={styles.hint}>
              <Info size={14} weight="bold" aria-hidden />
              {hiddenParents === 1 ? '1 issue pai não aparece' : `${hiddenParents} issues pai não aparecem`}: as horas
              são lançadas nas subtarefas.
            </p>
          )}
        </section>
      </>
    );
  }

  return (
    <Modal size={'medium'} labelledBy={titleId} header={header} onClose={onClose} isCloseDisabled={logWork.isPending} closeOnBackdrop={!selected}>
      {body}
    </Modal>
  );
}
