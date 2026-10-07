import { useEffect, useSyncExternalStore } from 'react';
import { type Theme, useThemeStore } from '../store/useThemeStore';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeToSystemTheme(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function systemPrefersDark() {
  return window.matchMedia(DARK_QUERY).matches;
}

/** Tema que vale na tela: o escolhido ou, em "Sistema", o do sistema operacional (acompanha a troca). */
export function useTheme(): Theme {
  const preference = useThemeStore((state) => state.preference);
  const systemDark = useSyncExternalStore(subscribeToSystemTheme, systemPrefersDark);
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

/**
 * Aplica o tema no `<html data-theme>`, que troca as variáveis de cor do
 * `global.css`. O `index.html` já aplica o tema salvo antes de o React montar;
 * aqui ele acompanha as trocas.
 */
export function useApplyTheme() {
  const theme = useTheme();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}
