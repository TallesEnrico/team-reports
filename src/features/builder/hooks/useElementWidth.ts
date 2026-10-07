import { useEffect, useRef, useState } from 'react';

/**
 * Largura de um elemento, acompanhando o redimensionamento (ex: a prévia no
 * painel da peça é estreita; o bloco do dashboard, largo). 0 antes de medir.
 */
export function useElementWidth<Element extends HTMLElement>() {
  const ref = useRef<Element>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
