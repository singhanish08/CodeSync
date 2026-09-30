import { type ReactNode } from 'react';

interface KbdProps {
  children: ReactNode;
  className?: string;
}

/** Keycap-styled keyboard hint (⌘K, ⌘↵, …). */
export const Kbd = ({ children, className }: KbdProps) => (
  <kbd className={`kbd ${className ?? ''}`}>{children}</kbd>
);
