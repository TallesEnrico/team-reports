import { CaretDown, CircleNotch } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { transitionsQueryOptions } from '../api/issueTransitionsQuery';
import type { IssueTransition, JiraIssue } from '../api/jira-issues';
import { describeTransitionError, useTransitionIssueMutation } from '../api/useTransitionIssueMutation';
import styles from './StatusPicker.module.css';
import { StatusLozenge } from './StatusLozenge';

interface StatusPickerProps {
  /** Se a issue é um card de um quadro em cache, o status muda nele na hora (otimista), como ao arrastar. */
  issue: JiraIssue;
  /** Sem escopo de escrita o status só aparece. */
  canChange: boolean;
  /** Status trocado com sucesso (o modal mostra a issue relida, que pode não ser um card do quadro). */
  onChanged?: (issue: JiraIssue) => void;
  /** Lado do status em que o menu se alinha (`end`: perto da borda direita, ex: numa linha de lista). */
  align?: 'start' | 'end';
  /**
   * Quem mostra o erro (ex: a linha da lista, embaixo dela inteira): recebe a
   * mensagem quando o Jira recusa e `null` numa nova tentativa. Sem isto, o erro
   * aparece ao lado do status.
   */
  onErrorChange?: (message: string | null) => void;
}

/**
 * Status atual que abre as transições possíveis da issue (padrão WAI-ARIA
 * "menu button"). Escolher uma faz a mesma escrita de arrastar o card.
 * O menu fica dentro do modal: no <body> ele ficaria atrás do <dialog>.
 */
export function StatusPicker({ issue, canChange, onChanged, align = 'start', onErrorChange }: StatusPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const move = useTransitionIssueMutation();
  // As transições dependem do status atual: buscadas ao abrir (e em cache por 30s).
  const transitionsQuery = useQuery({ ...transitionsQueryOptions(issue.id), enabled: isOpen });
  const transitions = transitionsQuery.data ?? [];

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  // Foco no primeiro item assim que as opções aparecem.
  useEffect(() => {
    if (isOpen && transitions.length > 0) itemRefs.current[0]?.focus();
  }, [isOpen, transitions.length]);

  // Enquanto o Jira responde, já mostra o status escolhido (o card do quadro também muda na hora).
  const status = move.isPending && move.variables ? move.variables.transition.to : issue.status;

  if (!canChange) return <StatusLozenge status={status} />;

  function close({ returnFocus }: { returnFocus: boolean }) {
    setIsOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(transition: IssueTransition) {
    close({ returnFocus: true });
    move.mutate(
      { issue, transition },
      {
        onSuccess: (updated) => onChanged?.(updated),
        onError: (error) => onErrorChange?.(`Não foi possível mudar o status: ${describeTransitionError(error)}`),
      },
    );
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = itemRefs.current.findIndex((item) => item === document.activeElement);
    const focusAt = (index: number) => itemRefs.current[(index + transitions.length) % transitions.length]?.focus();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusAt(current + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusAt(current - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusAt(transitions.length - 1);
        break;
      case 'Escape':
        // Fecha só o menu; sem isso o Esc também fecharia o modal.
        event.preventDefault();
        event.stopPropagation();
        close({ returnFocus: true });
        break;
      case 'Tab':
        close({ returnFocus: false });
        break;
    }
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={`Status: ${status.name}. Mudar status`}
        // Ocupado (e não desabilitado) enquanto o Jira responde: desabilitar tiraria o foco do botão.
        aria-busy={move.isPending}
        onClick={() => {
          if (move.isPending) return;
          move.reset();
          onErrorChange?.(null);
          setIsOpen((open) => !open);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !move.isPending) {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        <StatusLozenge status={status} />
        {move.isPending ? (
          <CircleNotch size={12} weight="bold" className={styles.spinner} aria-hidden />
        ) : (
          <CaretDown size={12} weight="bold" className={styles.caret} aria-hidden />
        )}
      </button>

      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label="Mudar status para"
          className={styles.menu}
          data-align={align}
          onKeyDown={handleMenuKeyDown}
        >
          {transitionsQuery.isPending ? (
            <p className={styles.state}>
              <CircleNotch size={14} weight="bold" className={styles.spinner} aria-hidden /> Carregando status…
            </p>
          ) : transitionsQuery.isError ? (
            <p className={styles.state}>Não foi possível carregar os status possíveis.</p>
          ) : transitions.length === 0 ? (
            <p className={styles.state}>Nenhuma transição disponível a partir deste status.</p>
          ) : (
            transitions.map((transition, index) => (
              <button
                key={transition.id}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={styles.item}
                onClick={() => choose(transition)}
              >
                <StatusLozenge status={transition.to} />
                {/* O nome da transição ajuda quando difere do status (ex: "Iniciar" → Em andamento). */}
                {transition.name.toLowerCase() !== transition.to.name.toLowerCase() && (
                  <span className={styles.transitionName}>{transition.name}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {move.isError && !onErrorChange && (
        <p role="alert" className={styles.error}>
          Não foi possível mudar o status: {describeTransitionError(move.error)}
        </p>
      )}
    </div>
  );
}
