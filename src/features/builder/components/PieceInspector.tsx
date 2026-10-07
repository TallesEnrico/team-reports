import { Copy, PuzzlePiece, Trash, WarningCircle, X } from '@phosphor-icons/react';
import { Button } from '../../../components/Button';
import { CATEGORY_LABELS, isVisualKind, PIECES } from '../lib/catalog';
import { sourceKindOf } from '../lib/describe';
import { useBuilderStore } from '../store/useBuilderStore';
import type { BuilderNode, VisualKind } from '../types';
import { inputResultOf, useBuilderContext } from './BuilderContext';
import styles from './PieceInspector.module.css';
import { IssuesForm, WorklogsForm } from './SourceForms';
import { FilterForm, GroupForm, SortForm } from './TransformForms';
import { VisualForm } from './VisualForm';
import { Widget } from './Widget';

type VisualNode = Extract<BuilderNode, { type: VisualKind }>;

/** Painel à direita do quadro: a configuração da peça selecionada, ou o passo a passo. */
export function PieceInspector({ node }: { node: BuilderNode | undefined }) {
  if (!node) return <BuildGuide />;
  return <PieceSettings key={node.id} node={node} />;
}

function PieceSettings({ node }: { node: BuilderNode }) {
  const context = useBuilderContext();
  const removePiece = useBuilderStore((state) => state.removePiece);
  const duplicatePiece = useBuilderStore((state) => state.duplicatePiece);
  const insertGroupBefore = useBuilderStore((state) => state.insertGroupBefore);
  const selectPiece = useBuilderStore((state) => state.selectPiece);
  const piece = PIECES[node.type];
  const Icon = piece.icon;
  const result = context.results[node.id];
  const inputResult = inputResultOf(context, node.id);
  const input = inputResult?.state === 'ready' ? inputResult.data : undefined;
  const props = { nodeId: node.id, connectedSquad: context.connectedSquad };
  const source = sourceKindOf(node.id, context.nodes, context.edges);

  let form;
  switch (node.type) {
    case 'worklogs':
      form = <WorklogsForm {...props} config={node.data} />;
      break;
    case 'issues':
      form = <IssuesForm {...props} config={node.data} />;
      break;
    case 'filter':
      form = <FilterForm nodeId={node.id} config={node.data} input={input} />;
      break;
    case 'group':
      form = <GroupForm nodeId={node.id} config={node.data} input={input} source={source} />;
      break;
    case 'sort':
      form = <SortForm nodeId={node.id} config={node.data} input={input} />;
      break;
    default:
      form = <VisualForm nodeId={node.id} kind={node.type} config={node.data} input={input} />;
  }

  return (
    // `nokey`: Delete/Backspace e setas aqui dentro não mexem nas peças do quadro.
    <aside className={`${styles.panel} nokey`} aria-label={`Configuração da peça ${piece.name}`}>
      <header className={styles.header} data-category={piece.category}>
        <span className={styles.icon}>
          <Icon size={16} weight="bold" aria-hidden />
        </span>
        <span className={styles.titles}>
          <span className={styles.category}>{CATEGORY_LABELS[piece.category]}</span>
          <h2 className={styles.name}>{piece.name}</h2>
        </span>
        <Button
          variant="ghost"
          className={styles.close}
          icon={<X size={16} weight="bold" aria-hidden />}
          aria-label="Fechar a configuração"
          title="Fechar (desmarca a peça)"
          onClick={() => selectPiece(null)}
        />
      </header>
      <p className={styles.description}>{piece.description}</p>

      {result?.state === 'error' && (
        <p className={styles.alert} data-tone="error" role="alert">
          <WarningCircle size={16} weight="bold" aria-hidden />
          {result.message}
        </p>
      )}
      {result?.state === 'idle' && (
        <div className={styles.alert} data-tone="idle">
          <PuzzlePiece size={16} weight="bold" aria-hidden />
          <span>
            {result.message}
            {result.fix === 'insert-group' && (
              <Button variant="secondary" className={styles.fix} onClick={() => insertGroupBefore(node.id, source)}>
                Encaixar "Agrupar e cruzar"
              </Button>
            )}
          </span>
        </div>
      )}
      {result?.state === 'ready' && result.note && (
        <p className={styles.alert} data-tone="idle">
          <WarningCircle size={16} weight="bold" aria-hidden />
          {result.note}
        </p>
      )}

      <div className={styles.form}>{form}</div>

      {isVisualKind(node.type) && (
        <section className={styles.preview} aria-label="Prévia do bloco">
          <p className={styles.sectionTitle}>Prévia</p>
          <Widget node={node as VisualNode} result={result} variant="preview" />
        </section>
      )}

      <footer className={styles.footer}>
        <Button variant="ghost" icon={<Copy size={14} weight="bold" aria-hidden />} onClick={() => duplicatePiece(node.id)}>
          Duplicar
        </Button>
        <Button
          variant="ghost"
          className={styles.remove}
          icon={<Trash size={14} weight="bold" aria-hidden />}
          onClick={() => removePiece(node.id)}
        >
          Remover peça
        </Button>
      </footer>
    </aside>
  );
}

const STEPS = [
  {
    title: 'Escolha os dados',
    text: 'Arraste "Horas lançadas" ou "Issues" da lateral para o quadro e escolha o período e os projetos.',
  },
  {
    title: 'Encaixe as transformações',
    text: 'No "+" de cada peça, encaixe "Filtrar" (só algumas pessoas, projetos, status) e "Agrupar e cruzar" (por pessoa, dia, projeto, e cruzado com um segundo campo).',
  },
  {
    title: 'Mostre o resultado',
    text: 'Termine cada caminho com uma peça de "Mostrar": Número, Barras, Colunas, Mapa de calor ou Tabela. Cada uma vira um bloco do dashboard.',
  },
  {
    title: 'Veja o dashboard',
    text: 'Em "Dashboard", no alto, os blocos aparecem na ordem das peças no quadro, de cima para baixo.',
  },
];

function BuildGuide() {
  return (
    <aside className={`${styles.panel} nokey`} aria-label="Como montar">
      <header className={styles.guideHeader}>
        <h2 className={styles.guideTitle}>Como montar</h2>
        <p className={styles.description}>Clique numa peça para configurar. Os dados correm da esquerda para a direita.</p>
      </header>
      <ol className={styles.steps}>
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <span className={styles.stepNumber}>{index + 1}</span>
            <span>
              <strong>{step.title}</strong>
              <span className={styles.stepText}>{step.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <dl className={styles.shortcuts}>
        <div>
          <dt>
            <kbd>Delete</kbd>
          </dt>
          <dd>remove a peça ou a ligação selecionada</dd>
        </div>
        <div>
          <dt>
            <kbd>Shift</kbd> + arrastar
          </dt>
          <dd>seleciona várias peças</dd>
        </div>
        <div>
          <dt>Rolagem</dt>
          <dd>aproxima e afasta o quadro</dd>
        </div>
      </dl>
    </aside>
  );
}
