import { useEffect } from 'react';
import { jiraSiteFaviconUrl } from '../api/jira-site';
import { useJiraSiteDomainQuery } from '../api/useJiraSiteDomainQuery';

/**
 * Com a conta conectada, troca o favicon do app (`/favicon.png`, no `index.html`)
 * pelo do site do Jira (`https://DOMINIO.atlassian.net/jira-favicon-scaled.png`),
 * se ele existir. Sem token, fica o padrão. O atlassian.net não libera CORS,
 * então a conferência é carregar a própria imagem: só entra se abrir; 404 ou
 * algo que não é imagem mantém o padrão.
 */
export function useJiraSiteFavicon() {
  const domain = useJiraSiteDomainQuery().data;

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!domain || !link) return;
    const defaultHref = link.href;
    const faviconUrl = jiraSiteFaviconUrl(domain);
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      if (image.naturalWidth > 0) link.href = faviconUrl;
    };
    image.src = faviconUrl;

    return () => {
      image.onload = null;
      link.href = defaultHref;
    };
  }, [domain]);
}
