import { useEffect, useRef, useState } from 'react';

/** Copia texto e expõe `copied` por alguns segundos, para feedback no botão. */
export function useCopyToClipboard(resetAfterMs = 2500) {
  const [copied, setCopied] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timeout.current), []);

  async function copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return false;
    }
    setCopied(true);
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setCopied(false), resetAfterMs);
    return true;
  }

  return { copy, copied };
}
