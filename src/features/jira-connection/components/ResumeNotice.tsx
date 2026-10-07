import { Notice } from '@/components/Notice';
import styles from './ResumeNotice.module.css';

interface ResumeNoticeProps {
  tone: 'success' | 'error';
  message: string;
  onClose: () => void;
}

export function ResumeNotice({ tone, message, onClose }: ResumeNoticeProps) {
  return (
    <div className={styles.banner}>
      <Notice tone={tone}>{message}</Notice>
      <button type="button" className={styles.close} onClick={onClose}>
        Fechar
      </button>
    </div>
  );
}
