import { useEffect, useState } from 'react';
import { useJiraSiteDomainQuery } from '@/api/useJiraSiteDomainQuery';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<{ outcome: 'accepted' | 'dismissed' }>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    __stopwatchInstall?: BeforeInstallPromptEvent;
  }
}

const INSTALL_PAGE = '/cronometro/index.html';

function isStandalone(): boolean {
  const safari = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || safari.standalone === true;
}

function isSmallWindow(): boolean {
  return new URLSearchParams(window.location.search).has('janela');
}

function installHint(): string {
  const safari = /Safari/i.test(navigator.userAgent) && !/Chrome|Chromium|Edg/i.test(navigator.userAgent);
  if (safari) {
    return 'No Safari, abra o menu Arquivo e escolha Adicionar ao Dock. O ícone abre o cronômetro direto, com a conta do Jira já conectada neste navegador.';
  }
  return 'No menu do Chrome ou do Edge, escolha Instalar Cronômetro (ou o ícone de instalar na barra de endereço). O atalho abre o cronômetro numa janela própria, com a conta já conectada neste navegador.';
}

export function stopwatchInstallHref(domain?: string | null): string {
  const url = new URL(INSTALL_PAGE, window.location.origin);
  url.searchParams.set('instalar', '1');
  if (domain) url.searchParams.set('domain', domain);
  return url.toString();
}

export function useStopwatchInstall() {
  const domain = useJiraSiteDomainQuery().data;
  const [standalone, setStandalone] = useState(isStandalone);
  const [hint, setHint] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).has('instalar') && !isStandalone()
      ? 'Clique em Instalar para criar o atalho. O ícone abre o cronômetro direto.'
      : null,
  );

  useEffect(() => {
    const onInstalled = () => {
      setStandalone(true);
      setHint(null);
      window.__stopwatchInstall = undefined;
    };
    window.addEventListener('appinstalled', onInstalled);

    if (!isSmallWindow() && window.location.pathname.startsWith('/cronometro/') && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/cronometro/sw.js').catch(() => undefined);
    }

    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  useEffect(() => {
    if (!domain || isSmallWindow() || !window.location.pathname.startsWith('/cronometro/')) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('domain') === domain) return;
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth <= 0) return;
      const next = new URLSearchParams(window.location.search);
      if (next.get('domain') === domain) return;
      next.set('domain', domain);
      window.location.replace(`${window.location.pathname}?${next}`);
    };
    image.src = `/cronometro/favicon?domain=${encodeURIComponent(domain)}&size=192`;
  }, [domain]);

  function install() {
    const event = window.__stopwatchInstall;
    if (!event) {
      setHint(installHint());
      return;
    }
    window.__stopwatchInstall = undefined;
    void event
      .prompt()
      .then(async (result) => {
        const outcome = result?.outcome ?? (await event.userChoice).outcome;
        if (outcome === 'accepted') setStandalone(true);
        else setHint(installHint());
      })
      .catch(() => setHint(installHint()));
  }

  return { standalone, hint, install };
}
