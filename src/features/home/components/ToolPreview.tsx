import type { ReactElement } from 'react';
import type { ToolProduct } from '../../../components/tools';
import styles from './ToolPreview.module.css';

/** Largura do desenho: larga o bastante para preencher os cards largos sem sobrar faixa vazia dos lados. */
const WIDTH = 420;
const HEIGHT = 132;

/** Linha de texto em miniatura (um traço arredondado). */
function Text({ x, y, width, className = styles.faint }: { x: number; y: number; width: number; className?: string }) {
  return <rect x={x} y={y} width={width} height={5} rx={2.5} className={className} />;
}

/** Reports: duas semanas de horas por dia, com as células lançadas em azul e os totais à direita. */
function ReportsPreview() {
  const days = Array.from({ length: 10 }, (_, day) => day);
  // Um espaço entre as semanas, no lugar do fim de semana.
  const dayX = (day: number) => 122 + day * 25 + (day >= 5 ? 12 : 0);
  const filled = [
    [0, 1, 2, 4, 6, 7, 9],
    [1, 3, 5, 8],
    [0, 2, 3, 4, 6, 9],
    [1, 4, 5, 7, 8],
    [0, 3, 6, 9],
  ];
  return (
    <>
      <Text x={16} y={14} width={46} />
      {days.map((day) => (
        <Text key={day} x={dayX(day) + 4} y={14} width={13} />
      ))}
      <Text x={388} y={14} width={16} />
      <rect x={16} y={26} width={388} height={1} className={styles.line} />
      {filled.map((cells, row) => {
        const y = 36 + row * 17;
        return (
          <g key={row}>
            <Text x={16} y={y + 3} width={30} className={styles.blue} />
            <Text x={50} y={y + 3} width={52 - (row % 3) * 12} />
            {cells.map((day) => (
              <g key={day}>
                <rect x={dayX(day)} y={y - 1} width={21} height={13} rx={3} className={styles.blueBg} />
                <rect x={dayX(day) + 4} y={y + 3} width={13} height={5} rx={2.5} className={styles.blue} />
              </g>
            ))}
            <Text x={388} y={y + 3} width={16} className={styles.ink} />
          </g>
        );
      })}
      <rect x={16} y={120} width={388} height={1} className={styles.line} />
    </>
  );
}

/** Kanban: quatro colunas de cards, com um sendo arrastado para a próxima coluna. */
function KanbanPreview() {
  const columns = [3, 2, 1, 2];
  return (
    <>
      {columns.map((count, column) => {
        const x = 16 + column * 100;
        return (
          <g key={column}>
            <Text x={x} y={12} width={36} />
            <rect x={x + 42} y={10} width={12} height={9} rx={4.5} className={styles.surfaceDeep} />
            {Array.from({ length: count }, (_, index) => (
              <g key={index}>
                <rect x={x} y={26 + index * 32} width={88} height={26} rx={4} className={styles.card} />
                <Text x={x + 8} y={33 + index * 32} width={56 - index * 10} className={column === 3 ? styles.faint : styles.ink} />
                <rect x={x + 8} y={42 + index * 32} width={7} height={5} rx={1.5} className={styles.green} />
                <Text x={x + 19} y={42 + index * 32} width={26} />
              </g>
            ))}
          </g>
        );
      })}
      {/* Onde o card vai cair: a coluna que aceita fica verde. */}
      <rect x={216} y={58} width={88} height={26} rx={4} className={styles.greenBg} />
      <g className={styles.dragged}>
        <rect x={168} y={70} width={88} height={26} rx={4} className={styles.cardLifted} />
        <Text x={176} y={77} width={50} className={styles.ink} />
        <rect x={176} y={86} width={7} height={5} rx={1.5} className={styles.green} />
        <Text x={187} y={86} width={30} />
      </g>
    </>
  );
}

/** Metrics: as horas de cada dia contra a jornada (a linha), com os fins de semana em faixa. */
function MetricsPreview() {
  const heights = [62, 70, 58, 66, 74, null, null, 68, 54, 72, 64, 70, null, null, 60, 76, 66, 58, 71];
  return (
    <>
      {[40, 72, 104].map((y) => (
        <rect key={y} x={16} y={y} width={388} height={1} className={styles.grid} />
      ))}
      {heights.map((height, index) => {
        const x = 20 + index * 20.5;
        if (height === null) return <rect key={index} x={x - 4} y={22} width={20} height={90} className={styles.band} />;
        return (
          <rect
            key={index}
            x={x}
            y={112 - height}
            width={12}
            height={height}
            rx={2}
            className={styles.bar}
            style={{ animationDelay: `${index * 25}ms` }}
          />
        );
      })}
      <rect x={16} y={112} width={388} height={1} className={styles.line} />
      <rect x={16} y={48} width={388} height={2} className={styles.ink} />
    </>
  );
}

/** Dashboard: peças de dados, transformar e mostrar encaixadas, como no quadro de montagem. */
function BuilderPreview() {
  const piece = (x: number, y: number, header: string, width = 88, height = 50) => (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={6} className={styles.card} />
      <path d={`M${x + 6} ${y}h${width - 12}a6 6 0 0 1 6 6v8h-${width}v-8a6 6 0 0 1 6-6z`} className={header} />
      <Text x={x + 8} y={y + 22} width={width - 30} className={styles.ink} />
    </g>
  );
  return (
    <>
      <path d="M104 66 C 122 66, 120 37, 140 37" className={styles.edge} />
      <path d="M104 66 C 122 66, 120 97, 140 97" className={styles.edge} />
      <path d="M228 37 C 246 37, 246 35, 266 35" className={styles.edge} />
      <path d="M228 97 C 246 97, 246 97, 266 97" className={styles.edge} />
      {piece(16, 41, styles.blueBg)}
      <Text x={24} y={73} width={44} />
      {piece(140, 12, styles.yellowBg)}
      <Text x={148} y={44} width={40} />
      {piece(140, 72, styles.yellowBg)}
      <Text x={148} y={104} width={52} />
      <g className={styles.lifted}>
        {piece(266, 8, styles.greenBg, 138, 56)}
        <rect x={274} y={40} width={96} height={4} rx={2} className={styles.red} />
        <rect x={274} y={47} width={70} height={4} rx={2} className={styles.red} />
        <rect x={274} y={54} width={44} height={4} rx={2} className={styles.red} />
      </g>
      <g className={styles.lifted}>
        {piece(266, 72, styles.greenBg, 138, 50)}
        <rect x={274} y={100} width={36} height={12} rx={2} className={styles.ink} />
      </g>
      {/* As abas de saída de cada peça. */}
      {[
        [104, 66],
        [228, 37],
        [228, 97],
      ].map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M${x} ${y - 7}a7 7 0 0 1 0 14z`} className={styles.tab} />
      ))}
    </>
  );
}

const PREVIEWS: Record<ToolProduct, () => ReactElement> = {
  reports: ReportsPreview,
  kanban: KanbanPreview,
  metrics: MetricsPreview,
  builder: BuilderPreview,
};

/** Miniatura do que cada ferramenta mostra, no card da página inicial (só ilustração). */
export function ToolPreview({ product }: { product: ToolProduct }) {
  const Preview = PREVIEWS[product];
  return (
    <span className={styles.preview} data-product={product} aria-hidden>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid meet" className={styles.svg}>
        <Preview />
      </svg>
    </span>
  );
}
