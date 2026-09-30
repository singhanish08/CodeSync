import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Renders a soft accent glow under the button (primary CTA look). */
  glow?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-foreground hover:brightness-110 active:brightness-95 shadow-[0_1px_0_var(--shadow)]',
  secondary: 'bg-bg-secondary text-text-primary hover:bg-bg-secondary/70 border border-border',
  ghost: 'bg-transparent text-text-secondary hover:text-text-primary hover:bg-bg-secondary',
  danger: 'bg-danger text-danger-foreground hover:brightness-110',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, glow, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'group relative inline-flex items-center justify-center gap-2 rounded-control font-medium',
        'transition-[transform,filter,background-color,color] duration-200 will-change-transform',
        'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        glow && 'shadow-glow hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_45%,transparent),0_12px_40px_-8px_var(--glow)]',
        className
      )}
      {...props}
    >
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
          aria-hidden
        />
      )}
      {children}
    </button>
  )
);

Button.displayName = 'Button';
