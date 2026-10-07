import { useId, useState } from 'react';
import { useProjectsQuery } from '@/api/useProjectsQuery';
import { FormField } from '@/components/FormField';
import { Notice } from '@/components/Notice';
import { SquadSelect } from '@/components/SquadSelect';
import { useJiraConnectionStore } from '@/store/useJiraConnectionStore';
import styles from './Section.module.css';

/**
 * "Meu cliente": a squad da conta conectada, escolhida no assistente de
 * conexão. Antes, trocá-la pedia "Sair" e conectar de novo.
 */
export function AccountSquadSection() {
  const headingId = useId();
  const inputId = useId();
  const squad = useJiraConnectionStore((state) => state.credentials?.squad);
  const changeSquad = useJiraConnectionStore((state) => state.changeSquad);
  const projectsQuery = useProjectsQuery();
  const [savedSquad, setSavedSquad] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(projectKey: string | null) {
    // `null` é a própria squad da conta: nada muda.
    if (!projectKey) return;
    try {
      await changeSquad(projectKey);
      setSavedSquad(projectKey);
      setError(null);
    } catch {
      setError('Não foi possível salvar a squad neste navegador. Tente de novo.');
    }
  }

  const savedName = projectsQuery.data?.find((project) => project.key === savedSquad)?.name;

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.head}>
        <h2 id={headingId} className={styles.heading}>
          Meu cliente
        </h2>
        <p className={styles.description}>
          A squad da sua conta, escolhida ao conectar. Ela é a squad padrão do Kanban e do Metrics e aparece como “sua squad”
          nas listas.
        </p>
      </div>
      <div className={styles.card}>
        <FormField
          label="Squad da conta"
          htmlFor={inputId}
          hint="Onde você já escolheu outra squad (no Kanban, no Metrics), a escolha continua."
        >
          <SquadSelect
            inputId={inputId}
            projects={projectsQuery.data ?? []}
            projectKey={squad}
            connectedSquad={squad}
            isLoading={projectsQuery.isLoading}
            onChange={(projectKey) => void handleChange(projectKey)}
          />
        </FormField>
        {savedSquad && savedSquad === squad && (
          <Notice tone="success">
            Squad da conta trocada para {savedName ? `${savedName} (${savedSquad})` : savedSquad}.
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {projectsQuery.isError && (
          <Notice tone="error">Não foi possível carregar as squads: {projectsQuery.error.message}</Notice>
        )}
      </div>
    </section>
  );
}
