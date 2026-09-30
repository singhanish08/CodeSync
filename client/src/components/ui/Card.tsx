import { type HTMLAttributes, type MouseEvent } from 'react';
import { cn } from '../../lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Enables the cursor-follow spotlight (ignored on touch devices). */
  spotlight?: boolean;
  /** Enables the shimmering gradient hairline border. */
  gradientBorder?: boolean;
}

/**
 * Surface card. Combines the two signature treatments (spotlight + gradient
 * hairline) via small pointer handlers that drive CSS variables.
 */
export const Card = ({
  className,
  spotlight = true,
  gradientBorder = true,
  onMouseMove,
  children,
  ...props
}: CardProps) => {
  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    onMouseMove?.(event);
    if (!spotlight) return;
    const currentTarget = event.currentTarget;
    const rect = currentTarget.getBoundingClientRect();
    currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      className={cn(
        'rounded-card border border-border bg-bg-secondary shadow-soft',
        spotlight && 'spotlight',
        gradientBorder && 'gradient-border',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('border-b border-border p-4', className)} {...props} />
);

export const CardBody = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-4', className)} {...props} />
);
