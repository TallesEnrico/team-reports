import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from '../lib/cx';
import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  icon?: ReactNode;
}

export function Button({ variant = 'secondary', icon, children, className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cx(styles.button, styles[variant], !children && styles.iconOnly, className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}
