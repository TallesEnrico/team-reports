import { ArrowClockwise, DownloadSimple, FileHtml, FilePdf, FileXls, Plus, ShareNetwork, Timer } from '@phosphor-icons/react';
import { BrandLogo } from '../../../components/BrandLogo';
import { Button } from '../../../components/Button';
import { openStopwatch } from '@/features/stopwatch/lib/openStopwatch';
import { type MenuItem, MenuButton } from '../../../components/MenuButton';
import type { ExportFormat } from '../lib/buildExportModel';
import styles from './ReportHeader.module.css';

interface ReportHeaderProps {
  meta: string[];
  isRefreshing: boolean;
  canRefresh: boolean;
  canExport: boolean;
  exportingFormat: ExportFormat | null;
  exportError: string | null;
  onRefresh: () => void;
  /** Abre o modal de lançar horas (escolhendo a tarefa). */
  onLogWork: () => void;
  onExport: (format: ExportFormat) => void;
  onShare: () => void;
}

const EXPORT_LABELS: Record<ExportFormat, string> = { pdf: 'PDF', html: 'HTML', xlsx: 'Excel' };

export function ReportHeader({
  meta,
  isRefreshing,
  canRefresh,
  canExport,
  exportingFormat,
  exportError,
  onRefresh,
  onLogWork,
  onExport,
  onShare,
}: ReportHeaderProps) {
  const exportItems: MenuItem[] = [
    {
      id: 'pdf',
      label: 'PDF',
      description: 'Documento em paisagem, pronto para imprimir ou enviar.',
      icon: <FilePdf size={18} weight="bold" />,
      onSelect: () => onExport('pdf'),
    },
    {
      id: 'html',
      label: 'HTML',
      description: 'Página com a tabela, abre em qualquer navegador.',
      icon: <FileHtml size={18} weight="bold" />,
      onSelect: () => onExport('html'),
    },
    {
      id: 'xlsx',
      label: 'Excel',
      description: 'Planilha .xlsx com as horas em formato somável.',
      icon: <FileXls size={18} weight="bold" />,
      onSelect: () => onExport('xlsx'),
    },
  ];

  return (
    <header className={styles.header}>
      <div className={styles.titles}>
        <BrandLogo product="reports" size="compact" />
        <p className={styles.meta}>
          {meta.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </p>
      </div>
      <div className={styles.side}>
        <div className={styles.actions}>
          <Button className="text-blue-500! dark:text-blue-ink!" variant="secondary" icon={<Plus size={16} weight="bold" />} onClick={onLogWork} aria-haspopup="dialog">
            Lançar horas
          </Button>
          <Button variant="secondary" icon={<Timer size={16} weight="bold" />} onClick={() => openStopwatch()}>
            Cronômetro
          </Button>
          <Button
            variant="ghost"
            icon={<ArrowClockwise size={16} weight="bold" className={isRefreshing ? styles.spinning : undefined} />}
            onClick={onRefresh}
            disabled={!canRefresh || isRefreshing}
            aria-label="Atualizar dados do Jira"
            title="Atualizar dados do Jira"
            className="bg-tint!"
          >
            Atualizar
          </Button>
          <Button
            variant="ghost"
            icon={<ShareNetwork size={16} weight="bold" />}
            onClick={onShare}
            aria-haspopup="dialog"
            title="Copiar o link dos filtros ou enviar para quem está conectado"
            className="bg-tint!"
          >
            Compartilhar
          </Button>
          <MenuButton
            label={exportingFormat ? `Gerando ${EXPORT_LABELS[exportingFormat]}…` : 'Exportar'}
            icon={<DownloadSimple size={16} weight="bold" />}
            items={exportItems}
            disabled={!canExport || exportingFormat !== null}
          />
        </div>
        {exportError && (
          <p className={styles.error} role="alert">
            {exportError}
          </p>
        )}
      </div>
    </header>
  );
}
