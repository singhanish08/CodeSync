import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface GradientTextProps {
  children: ReactNode;
  className?: string;
  /** Uses the animated gradient-pan by default. */
  animated?: boolean;
}

export const GradientText = ({ children, className, animated = true }: GradientTextProps) => (
  <span className={cn('text-gradient', !animated && '[animation:none]', className)}>{children}</span>
);
