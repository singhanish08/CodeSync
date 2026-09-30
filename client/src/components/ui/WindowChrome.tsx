import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface WindowChromeProps {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Shows the mac-style traffic-light dots. */
  dots?: boolean;
  /** Right-aligned slot for status text / keycap hints. */
  trailing?: ReactNode;
}

/**
 * "Window chrome" frame used to present every code demo on the site — the
 * repeating motif that makes the product feel like an IDE.
 */
export const WindowChrome = ({ title, children, className, dots = true, trailing }: WindowChromeProps) => (
  <div
    className={cn(
      'overflow-hidden rounded-card border border-border bg-bg-secondary shadow-lifted gradient-border',
      className
    )}
  >
    <div className="flex h-9 shrink-0 items-center gap-3 border-b border-border bg-bg-secondary/80 px-3">
      {dots && (
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <span className="truncate font-mono text-[11px] text-text-secondary">{title}</span>
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
    {children}
  </div>
);
