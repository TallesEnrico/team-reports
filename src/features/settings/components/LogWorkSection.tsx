import { useId } from 'react';
import { useLogWorkSettingsStore } from '@/store/useLogWorkSettingsStore';
import styles from './LogWorkSection.module.css';
import sectionStyles from './Section.module.css';

export function LogWorkSection() {
  const headingId = useId();
  const closeOnSuccess = useLogWorkSettingsStore((state) => state.closeOnSuccess);
  const setCloseOnSuccess = useLogWorkSettingsStore((state) => state.setCloseOnSuccess);

  return (
    <section className={sectionStyles.section} aria-labelledby={headingId}>
      <div className={sectionStyles.head}>
        <h2 id={headingId} className={sectionStyles.heading}>
          Lançar horas
        </h2>
        <p className={sectionStyles.description}>
          Depois de um lançamento bem-sucedido, a janela pode fechar sozinha. A mesma opção fica no cabeçalho da janela
          de lançamento, salva neste navegador.
        </p>
      </div>
      <div className={sectionStyles.card}>
        <label className={styles.toggle}>
          <input type="checkbox" checked={closeOnSuccess} onChange={(event) => setCloseOnSuccess(event.target.checked)} />
          <span>Fechar a janela ao concluir o lançamento</span>
        </label>
      </div>
    </section>
  );
}
