import { ArrowClockwise } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { BrandLogo, type BrandProduct } from '../../../components/BrandLogo';
import { Button } from '../../../components/Button';
import { LabeledSelect, type SelectOption } from '../../../components/LabeledSelect';
import styles from './BoardHeader.module.css';

interface BoardHeaderProps<GroupBy extends string> {
  /** Marca da tela (Kanban no quadro, Spreadsheet na planilha). */
  product: BrandProduct;
  meta: string[];
  /** Antes dos controles (ex: o seletor de visualização). */
  leading?: ReactNode;
  groupBy: GroupBy;
  groupByOptions: SelectOption<GroupBy>[];
  onGroupByChange: (groupBy: GroupBy) => void;
  isRefreshing: boolean;
  canRefresh: boolean;
  onRefresh: () => void;
  /** Depois do agrupamento (ex: "Criar história"). */
  extra?: ReactNode;
}

/**
 * Cabeçalho do Kanban (quadro e planilha): marca, resumo, visualização,
 * agrupamento e "Atualizar". As concluídas mais antigas vêm pelo "Carregar mais", depois do último card.
 */
export function BoardHeader<GroupBy extends string>({
  product,
  meta,
  leading,
  groupBy,
  groupByOptions,
  onGroupByChange,
  isRefreshing,
  canRefresh,
  onRefresh,
  extra,
}: BoardHeaderProps<GroupBy>) {
  return (
    <header className={styles.header}>
      <div className={styles.titles}>
        <BrandLogo product={product} size="compact" />
        <p className={styles.meta}>
          {meta.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </p>
      </div>
      <div className={styles.actions}>
        {leading}
        <LabeledSelect layout="inline" label="Agrupar" value={groupBy} options={groupByOptions} onChange={onGroupByChange} />
        {extra}
        <Button
          variant="ghost"
          icon={<ArrowClockwise size={16} weight="bold" className={isRefreshing ? styles.spinning : undefined} />}
          onClick={onRefresh}
          disabled={!canRefresh || isRefreshing}
          title="Buscar o quadro de novo no Jira"
          className="bg-tint!"
        >
          Atualizar
        </Button>
      </div>
    </header>
  );
}
