/** Nó do Atlassian Document Format, o formato dos textos ricos na API v3. */
export interface AdfNode {
  type?: string;
  version?: number;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
}

// Blocos que contêm só nós inline: o texto deles é concatenado sem separador
// (um trecho em negrito vira um nó `text` à parte no meio da frase).
const INLINE_CONTAINERS = new Set(['paragraph', 'heading', 'codeBlock']);

function collectText(node: AdfNode): string {
  if (node.text) return node.text;
  if (node.type === 'hardBreak') return '\n';
  // Menções, emojis e status levam o texto em `attrs`; links embutidos, a URL.
  const attrText = node.attrs?.text ?? (node.type === 'inlineCard' ? node.attrs?.url : undefined);
  if (typeof attrText === 'string') return attrText;

  const separator = INLINE_CONTAINERS.has(node.type ?? '') ? '' : '\n';
  return (node.content ?? []).map(collectText).join(separator);
}

/** Texto corrido (uma linha, espaços normalizados) de um documento ADF. */
export function adfToText(doc: AdfNode): string {
  return collectText(doc).replace(/\s+/g, ' ').trim();
}

/** Texto simples de um documento ADF: uma linha por parágrafo ou item de lista. */
export function adfToPlainText(doc: AdfNode): string {
  return collectText(doc)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Documento ADF com um parágrafo por linha do texto (o inverso de `adfToPlainText`). */
export function plainTextToAdf(text: string): AdfNode {
  const trimmed = text.trim();
  return {
    type: 'doc',
    version: 1,
    content: trimmed
      ? trimmed.split('\n').map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] }))
      : [],
  };
}
