import { Timer, X } from '@phosphor-icons/react';
import { useId } from 'react';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { Notice } from '@/components/Notice';
import { useJiraSiteDomainQuery } from '@/api/useJiraSiteDomainQuery';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatClock } from '../lib/clock';
import { useStopwatch } from '../hooks/useStopwatch';
import { stopwatchInstallHref, useStopwatchInstall } from '../hooks/useStopwatchInstall';
import { StopwatchIssuePicker } from './StopwatchIssuePicker';
import styles from './StopwatchPage.module.css';

export function StopwatchPage() {
  useDocumentTitle('Cronômetro');
  const clock = useStopwatch();
  const install = useStopwatchInstall();
  const domain = useJiraSiteDomainQuery().data;
  const canInstallHere =
    window.location.pathname.startsWith('/cronometro/') && !new URLSearchParams(window.location.search).has('janela');
  const titleId = useId();
  const commentId = useId();
  const toggleLabel = clock.isRunning ? 'Pausar' : clock.seconds > 0 ? 'Retomar' : 'Iniciar';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Apontamento</p>
          <h1 id={titleId} className={styles.title}>
            <Timer size={18} weight="bold" aria-hidden />
            Cronômetro
          </h1>
        </div>
        {!install.standalone && (
          <div className={styles.headerActions}>
            {canInstallHere ? (
              <Button
                variant="ghost"
                className={styles.install}
                autoFocus={new URLSearchParams(window.location.search).has('instalar')}
                onClick={() => install.install()}
              >
                Instalar
              </Button>
            ) : (
              <a className={styles.installLink} href={stopwatchInstallHref(domain)} target="_blank">
                Instalar
              </a>
            )}
            <Button
              variant="ghost"
              className={styles.close}
              icon={<X size={16} weight="bold" aria-hidden />}
              aria-label="Fechar cronômetro"
              disabled={clock.isSaving}
              onClick={() => window.close()}
            />
          </div>
        )}
      </header>

      <div className={styles.body}>
        {install.hint && <p className={styles.installHint}>{install.hint}</p>}
        <div className={styles.clockBlock}>
          <p className={styles.clock} data-paused={clock.isRunning ? undefined : ''}>
            {formatClock(clock.seconds)}
          </p>
          {clock.seconds > 0 && (
            <button type="button" className={styles.reset} onClick={clock.reset} disabled={clock.isSaving}>
              Zerar
            </button>
          )}
        </div>

        <StopwatchIssuePicker
          issueKey={clock.issueKey}
          issueSummary={clock.issueSummary}
          disabled={clock.isSaving}
          onChoose={clock.chooseIssue}
        />

        <div className={styles.comment}>
          <FormField label="Descrição" htmlFor={commentId}>
            <textarea
              id={commentId}
              className={`input ${styles.textarea}`}
              rows={3}
              value={clock.description}
              disabled={!clock.canTrack || clock.isSaving}
              onChange={(event) => clock.setDescription(event.target.value)}
            />
          </FormField>
        </div>

        {clock.notice && <Notice tone={clock.notice.tone}>{clock.notice.text}</Notice>}

        <div className={styles.actions}>
          <Button variant="secondary" onClick={clock.toggle} disabled={!clock.canTrack || clock.isSaving}>
            {toggleLabel}
          </Button>
          <Button variant="primary" onClick={() => void clock.launch()} disabled={!clock.canTrack || clock.seconds <= 0 || clock.isSaving}>
            {clock.isSaving ? 'Lançando…' : 'Lançar horas'}
          </Button>
        </div>
      </div>
    </div>
  );
}
