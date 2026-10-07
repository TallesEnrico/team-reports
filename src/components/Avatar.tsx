import { useState } from 'react';
import { cx } from '../lib/cx';
import styles from './Avatar.module.css';

interface AvatarProps {
  /** Foto pública do Jira (carrega sem token). */
  src?: string;
  /** Nome da pessoa: vira as iniciais quando não há foto. */
  name: string;
  size?: number;
  className?: string;
  /** Mostra o nome no hover (ex: avatar solto num card). */
  showTitle?: boolean;
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

export function Avatar({ src, name, size = 20, className, showTitle = false }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const title = showTitle ? name : undefined;
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };

  if (src && src !== failedSrc) {
    return (
      <img
        className={cx(styles.avatar, className)}
        src={src}
        alt=""
        title={title}
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(src)}
      />
    );
  }
  return (
    <span className={cx(styles.avatar, styles.initials, className)} style={style} title={title} aria-hidden>
      {initialsOf(name)}
    </span>
  );
}
