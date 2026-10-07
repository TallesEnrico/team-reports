import type { MouseEvent } from 'react';

/**
 * Clique simples num link. Com Ctrl/⌘/Shift/Alt ou o botão do meio, o
 * navegador abre o link (ex: em outra aba) e a tela não deve interceptar.
 */
export function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
