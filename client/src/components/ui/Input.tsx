import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
  /** Renders a show/hide toggle (password fields). */
  reveal?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, reveal, id, type, ...props }, ref) => {
    const inputId = id ?? props.name;
    const [visible, setVisible] = useState(false);
    const computedType = reveal ? (visible ? 'text' : 'password') : type;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-text-primary"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            type={computedType}
            aria-invalid={Boolean(error)}
            className={cn(
              'h-11 w-full rounded-control border bg-bg-primary px-3.5 text-text-primary placeholder:text-text-secondary/70',
              'transition-[border-color,box-shadow] duration-150',
              'focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)]',
              icon ? 'pl-10' : undefined,
              reveal ? 'pr-10' : undefined,
              error ? 'border-danger' : 'border-border',
              className
            )}
            {...props}
          />
          {reveal && (
            <button
              type="button"
              onClick={() => setVisible((value) => !value)}
              className="absolute right-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-text-secondary transition-colors hover:text-text-primary"
              aria-label={visible ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
        </div>
        {/* Reserve space so validation messages never shift the layout. */}
        <div className="min-h-[1.25rem] pt-1">
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </div>
    );
  }
);

Input.displayName = 'Input';
