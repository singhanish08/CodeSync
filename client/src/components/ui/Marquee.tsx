import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface MarqueeProps {
  children: ReactNode;
  className?: string;
  reverse?: boolean;
  /** Pause the marquee on hover. */
  pauseOnHover?: boolean;
}

/**
 * Infinite marquee. The track is duplicated so a -50% translate loops
 * seamlessly; `pauseOnHover` halts it for readability.
 */
export const Marquee = ({ children, className, reverse = false, pauseOnHover = true }: MarqueeProps) => (
  <div className={cn('relative flex overflow-hidden', pauseOnHover && 'marquee-paused', className)}>
    <div className={cn('marquee-track shrink-0', reverse && 'reverse')}>
      {children}
      <span aria-hidden className="flex">
        {children}
      </span>
    </div>
  </div>
);
