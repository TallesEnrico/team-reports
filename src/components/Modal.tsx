import { X } from '@phosphor-icons/react';
import { type MouseEvent, type PointerEvent, type ReactNode, type SyntheticEvent, useEffect, useRef } from 'react';
import { cx } from '../lib/cx';
import { Button } from './Button';
import styles from './Modal.module.css';

interface ModalProps {
  /** Id do título dentro de `header` (aria-labelledby). */
  labelledBy: string;
  /** Cabeçalho, ao lado do botão de fechar. */
  header: ReactNode;
  children: ReactNode;
  onClose: () => void;
  /** Esc: `event.preventDefault()` mantém o modal aberto (ex: sair só de uma edição). */
  onCancel?: (event: SyntheticEvent) => void;
  /** Bloqueia o fechamento pelo botão, pelo Esc e pelo fundo (ex: enquanto salva). */
  isCloseDisabled?: boolean;
  /** Clique no fundo fecha (padrão: sim). */
  closeOnBackdrop?: boolean;
  size?: 'medium' | 'large';
}

/**
 * <dialog> modal nativo: prende o foco, deixa a página inerte e devolve o foco
 * ao fechar. Monte o componente para abrir e desmonte (via `onClose`) para fechar.
 */
export function Modal({
  labelledBy,
  header,
  children,
  onClose,
  onCancel,
  isCloseDisabled = false,
  closeOnBackdrop = true,
  size = 'medium',
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pointerDownOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  // O evento `close` é assíncrono: no StrictMode o efeito acima abre, fecha e
  // reabre o modal, e o `close` do fechamento chega com ele já reaberto.
  function handleClose() {
    if (!dialogRef.current?.open) onClose();
  }

  function handleCancel(event: SyntheticEvent) {
    if (isCloseDisabled) event.preventDefault();
    else onCancel?.(event);
  }

  // Clique no fundo fecha, desde que o clique também tenha começado nele
  // (arrastar uma seleção de texto até fora do modal não fecha).
  function handlePointerDown(event: PointerEvent<HTMLDialogElement>) {
    pointerDownOnBackdrop.current = event.target === event.currentTarget;
  }

  function handleClick(event: MouseEvent<HTMLDialogElement>) {
    const isBackdrop = pointerDownOnBackdrop.current && event.target === event.currentTarget;
    if (isBackdrop && closeOnBackdrop && !isCloseDisabled) dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      className={cx(styles.dialog, styles[size])}
      aria-labelledby={labelledBy}
      onCancel={handleCancel}
      onClose={handleClose}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      <header className={styles.header}>
        <div className={styles.heading}>{header}</div>
        <Button
          variant="ghost"
          className={styles.closeButton}
          icon={<X size={16} weight="bold" aria-hidden />}
          aria-label="Fechar"
          disabled={isCloseDisabled}
          onClick={() => dialogRef.current?.close()}
        />
      </header>
      <div className={styles.body}>{children}</div>
    </dialog>
  );
}
