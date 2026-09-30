import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';

type Variant = 'default' | 'accent' | 'success' | 'warning' | 'danger';

interface BadgeProps {
  children: ReactNode;
  variant?: Variant;
  className?: string;
  icon?: ReactNode;
}

const variants: Record<Variant, string> = {
  default: 'border-border bg-bg-secondary text-text-secondary',
  accent: 'border-accent/40 bg-accent/10 text-accent',
  success: 'border-success/40 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  danger: 'border-danger/40 bg-danger/10 text-danger',
};

export const Badge = ({ children, variant = 'default', className, icon }: BadgeProps) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
      variants[variant],
      className
    )}
  >
    {icon}
    {children}
  </span>
);
