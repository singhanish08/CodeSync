import { type ReactNode, useState } from 'react';
import { cn } from '../../lib/utils';

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}

/**
 * Minimal tooltip: shows on hover/focus, positioned with pure CSS. Kept
 * dependency-free and keyboard accessible (the trigger is focusable).
 */
export const Tooltip = ({ children, content, side = 'top', className }: TooltipProps) => {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-bg-primary px-2.5 py-1.5 text-xs font-medium text-text-primary shadow-lifted',
          'transition-[opacity,transform] duration-150',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          open ? 'translate-y-0 opacity-100' : side === 'top' ? 'translate-y-1 opacity-0' : '-translate-y-1 opacity-0',
          className
        )}
      >
        {content}
      </span>
    </span>
  );
};
