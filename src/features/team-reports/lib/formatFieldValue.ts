import { formatDateBR, isDateKey } from '../../../lib/dates';
import type { JiraField } from '../types';
import { type AdfNode, adfToText } from '../../../lib/adf';

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Texto de exibição para o valor cru de um campo do Jira (usuário, status, sprint, opção, ADF…). */
export function formatFieldValue(value: unknown, field?: JiraField): string {
  if (value === null || value === undefined || value === '') return '';

  if (Array.isArray(value)) {
    return value.map((item) => formatFieldValue(item, field)).filter(Boolean).join(', ');
  }

  if (typeof value === 'string') {
    if (field?.schemaType === 'date' && isDateKey(value)) return formatDateBR(value);
    if (field?.schemaType === 'datetime') {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return dateTimeFormatter.format(date);
    }
    return value;
  }

  if (typeof value === 'number') return value.toLocaleString('pt-BR');
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.type === 'doc') return adfToText(record as AdfNode);
    for (const key of ['displayName', 'name', 'value', 'key']) {
      if (typeof record[key] === 'string') {
        // Campos cascata trazem a opção filha em `child`.
        const child = record.child ? formatFieldValue(record.child, field) : '';
        return child ? `${record[key]} › ${child}` : (record[key] as string);
      }
    }
  }

  return '';
}
