import { useEffect } from 'react';
import { setBaseTitle } from '@/lib/documentTitle';

/** Título da aba enquanto a tela está aberta. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    setBaseTitle(title);
  }, [title]);
}
