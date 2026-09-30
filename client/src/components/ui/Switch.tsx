import { cn } from '../../lib/utils';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

/** Accessible toggle styled as a sliding switch (used for "Remember me"). */
export const Switch = ({ checked, onChange, label, className, disabled }: SwitchProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200',
      'focus-visible:shadow-[0_0_0_2px_var(--bg-primary),0_0_0_4px_var(--accent)]',
      checked ? 'bg-accent' : 'bg-bg-secondary border border-border',
      disabled && 'cursor-not-allowed opacity-50',
      className
    )}
  >
    <span
      className={cn(
        'inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-soft transition-transform duration-200',
        checked ? 'translate-x-[1.375rem]' : 'translate-x-[0.125rem]'
      )}
      style={{ height: '1.125rem', width: '1.125rem' }}
    />
  </button>
);
