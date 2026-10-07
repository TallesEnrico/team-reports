import { ArrowDown, CircleNotch } from '@phosphor-icons/react';
import { Button } from '../../../components/Button';
import { cx } from '../../../lib/cx';
import { type DoneWindow, nextDoneWindow } from '../types';
import styles from './LoadMoreDone.module.css';

/** O que está na tela em cada passo. */
const SHOWN_LABEL: Record<DoneWindow, string> = {
  'one-week': 'Concluídas da última semana',
  'two-weeks': 'Concluídas das últimas 2 semanas',
  'four-weeks': 'Concluídas das últimas 4 semanas',
  all: 'Todas as concluídas',
};

/** O que o próximo clique traz. */
const NEXT_LABEL: Record<DoneWindow, string> = {
  'one-week': 'Mostrar as concluídas da última semana',
  'two-weeks': 'Mostrar as concluídas das últimas 2 semanas',
  'four-weeks': 'Mostrar as concluídas das últimas 4 semanas',
  all: 'Mostrar todas as concluídas',
};

interface LoadMoreDoneProps {
  doneWindow: DoneWindow;
  isLoading: boolean;
  onLoadMore: () => void;
  /** `stack`: o período acima do botão, centralizados (colunas do quadro); `inline`: lado a lado (planilha). */
  layout?: 'stack' | 'inline';
  className?: string;
}

/**
 * "Carregar mais" das concluídas, depois do último card: o quadro começa pela
 * última semana, e cada clique amplia (2 semanas, 4, todas). Com todas na tela, só o aviso.
 */
export function LoadMoreDone({ doneWindow, isLoading, onLoadMore, layout = 'stack', className }: LoadMoreDoneProps) {
  const next = nextDoneWindow(doneWindow);
  return (
    <div className={cx(styles.loadMore, className)} data-layout={layout}>
      <p className={styles.shown}>{SHOWN_LABEL[doneWindow]}</p>
      {next && (
        // Sem `disabled` enquanto carrega: o foco fica no botão para o próximo clique.
        <Button
          variant="secondary"
          icon={
            isLoading ? (
              <CircleNotch size={14} weight="bold" className={styles.spinning} aria-hidden />
            ) : (
              <ArrowDown size={14} weight="bold" aria-hidden />
            )
          }
          onClick={() => {
            if (!isLoading) onLoadMore();
          }}
          aria-disabled={isLoading || undefined}
          title={NEXT_LABEL[next]}
          className={styles.button}
        >
          {isLoading ? 'Carregando…' : 'Carregar mais'}
        </Button>
      )}
    </div>
  );
}
