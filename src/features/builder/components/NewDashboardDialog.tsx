import { Buildings, ListChecks, Sparkle, Square, UploadSimple, User, UsersThree } from '@phosphor-icons/react';
import { useId } from 'react';
import { Modal } from '../../../components/Modal';
import { TEMPLATES, type TemplateId } from '../lib/templates';
import { useBuilderStore } from '../store/useBuilderStore';
import { useBuilderContext } from './BuilderContext';
import styles from './NewDashboardDialog.module.css';

const ICONS: Record<TemplateId, typeof Buildings> = {
  'company-month': Buildings,
  'open-issues': ListChecks,
  'squad-month': UsersThree,
  'my-hours': User,
  blank: Square,
};

/** Começar um dashboard: com a IA, de um modelo (peças já ligadas, para ajustar), em branco ou de um arquivo. */
export function NewDashboardDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const createDashboard = useBuilderStore((state) => state.createDashboard);
  const { importDashboardFile, openAiDialog } = useBuilderContext();

  return (
    <Modal
      labelledBy={titleId}
      onClose={onClose}
      header={
        <div className={styles.titles}>
          <h2 id={titleId} className={styles.title}>
            Novo dashboard
          </h2>
          <p className={styles.subtitle}>Peça à IA, comece de um modelo e ajuste as peças, ou monte do zero.</p>
        </div>
      }
    >
      <ul className={styles.list}>
        <li className={styles.featured}>
          <button
            type="button"
            className={styles.option}
            data-ai
            onClick={() => {
              onClose();
              openAiDialog('create');
            }}
          >
            <span className={styles.icon}>
              <Sparkle size={18} weight="fill" aria-hidden />
            </span>
            <span className={styles.text}>
              <span className={styles.name}>Criar com IA</span>
              <span className={styles.description}>
                Descreva o que você quer ver (ex: "quem não está lançando horas") e a IA monta as peças. Usa a sua chave da
                OpenRouter, que tem modelos gratuitos.
              </span>
            </span>
          </button>
        </li>
        {TEMPLATES.map((template) => {
          const Icon = ICONS[template.id];
          return (
            <li key={template.id}>
              <button
                type="button"
                className={styles.option}
                data-blank={template.id === 'blank' || undefined}
                onClick={() => {
                  createDashboard(template.id);
                  onClose();
                }}
              >
                <span className={styles.icon}>
                  <Icon size={18} weight="bold" aria-hidden />
                </span>
                <span className={styles.text}>
                  <span className={styles.name}>{template.name}</span>
                  <span className={styles.description}>{template.description}</span>
                </span>
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            className={styles.option}
            data-blank
            onClick={() => {
              onClose();
              importDashboardFile();
            }}
          >
            <span className={styles.icon}>
              <UploadSimple size={18} weight="bold" aria-hidden />
            </span>
            <span className={styles.text}>
              <span className={styles.name}>Importar de um arquivo</span>
              <span className={styles.description}>Um dashboard exportado (.json), seu ou de outra pessoa. Vira um dashboard novo.</span>
            </span>
          </button>
        </li>
      </ul>
    </Modal>
  );
}
