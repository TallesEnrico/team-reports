import { useId } from 'react';
import { Button } from '../../../components/Button';
import { Modal } from '../../../components/Modal';
import { useBuilderStore } from '../store/useBuilderStore';
import type { Dashboard } from '../types';
import styles from './DeleteDashboardDialog.module.css';

/** Confirmação antes de excluir um dashboard (não dá para desfazer). */
export function DeleteDashboardDialog({ dashboard, onClose }: { dashboard: Dashboard; onClose: () => void }) {
  const titleId = useId();
  const deleteDashboard = useBuilderStore((state) => state.deleteDashboard);
  return (
    <Modal
      labelledBy={titleId}
      onClose={onClose}
      header={
        <h2 id={titleId} className={styles.title}>
          Excluir "{dashboard.name}"?
        </h2>
      }
    >
      <p className={styles.text}>
        As peças e as ligações dele somem deste navegador. Não dá para desfazer: se quiser guardar, use "Exportar" antes.
      </p>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          className={styles.danger}
          onClick={() => {
            deleteDashboard(dashboard.id);
            onClose();
          }}
        >
          Excluir dashboard
        </Button>
      </div>
    </Modal>
  );
}
