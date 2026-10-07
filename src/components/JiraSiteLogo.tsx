import { useState } from 'react';
import { jiraSiteLogoUrl, jiraSiteFaviconUrl } from '../api/jira-site';
import { useJiraSiteDomainQuery } from '../api/useJiraSiteDomainQuery';
import fallbackLogoSrc from '@/assets/logo.png';
import fallbackFaviconSrc from '@/assets/favicon.png';

interface JiraSiteLogoProps {
  alt: string;
  className?: string;
}

/**
 * O logo do site do Jira (`https://DOMINIO.atlassian.net/jira-logo-scaled.png`),
 * com o domínio vindo do próprio Jira, só com a conta conectada. Sem token,
 * enquanto o domínio não chega, ou se a imagem não carrega, fica o logo padrão
 * do app (`src/assets/logo.png`).
 */
export function JiraSiteLogo({ alt, className }: JiraSiteLogoProps) {
  const domain = useJiraSiteDomainQuery().data;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const siteSrc = domain ? jiraSiteLogoUrl(domain) : null;
  const src = siteSrc && siteSrc !== failedSrc ? siteSrc : fallbackLogoSrc;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      onError={() => {
        if (src === siteSrc) setFailedSrc(siteSrc);
      }}
    />
  );
}

export function JiraSiteFavicon({ alt, className }: JiraSiteLogoProps) {
  const domain = useJiraSiteDomainQuery().data;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const siteSrc = domain ? jiraSiteFaviconUrl(domain) : null;
  const src = siteSrc && siteSrc !== failedSrc ? siteSrc : fallbackFaviconSrc;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      onError={() => {
        if (src === siteSrc) setFailedSrc(siteSrc);
      }}
    />
  );
}
