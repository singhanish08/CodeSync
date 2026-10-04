import { useRef, type MouseEvent } from 'react';
import { Sun, Moon, ShieldCheck } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import type { AppTheme } from '../types';
import { cn } from '../lib/utils';
import { THEME_LABELS } from '../lib/utils';
import { Tooltip } from './ui/Tooltip';

const OPTIONS: Array<{ value: AppTheme; icon: typeof Sun; label: string }> = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'eyeshield', icon: ShieldCheck, label: 'Eye Shield' },
];

interface ThemeToggleProps {
  /** Compact cycle button instead of the segmented control (tight spaces). */
  compact?: boolean;
  className?: string;
}

/**
 * Three-way segmented theme switch with a sliding highlight. Switching uses
 * the View Transitions API: a circular reveal expands from the toggle itself,
 * with an instant fallback where unsupported.
 */
export const ThemeToggle = ({ compact = false, className }: ThemeToggleProps) => {
  const { theme, setTheme, transitionToTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  const switchTo = (next: AppTheme, event?: MouseEvent) => {
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      const rect = containerRef.current?.getBoundingClientRect();
      const origin = rect
        ? { x: event?.clientX ?? rect.left + rect.width / 2, y: event?.clientY ?? rect.top + rect.height / 2 }
        : undefined;
      transitionToTheme(next, origin);
    } else {
      setTheme(next);
    }
  };

  if (compact) {
    const CurrentIcon = OPTIONS.find((option) => option.value === theme)?.icon ?? Moon;
    const next: AppTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'eyeshield' : 'light';
    return (
      <Tooltip content={THEME_LABELS[theme]} side="bottom">
        <button
          ref={containerRef as never}
          type="button"
          onClick={(event) => switchTo(next, event)}
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-bg-secondary text-text-primary transition-colors hover:opacity-80',
            className
          )}
          aria-label={`Switch theme (currently ${theme}, click for ${next})`}
        >
          <CurrentIcon size={18} />
        </button>
      </Tooltip>
    );
  }

  const activeIndex = Math.max(OPTIONS.findIndex((option) => option.value === theme), 0);

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label="Theme"
      className={cn(
        'relative inline-flex items-center gap-0.5 rounded-lg border border-border bg-bg-secondary p-0.5',
        className
      )}
    >
      <span
        aria-hidden
        className="absolute top-0.5 bottom-0.5 rounded-[7px] bg-accent shadow-soft transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          width: 'calc((100% - 0.25rem) / 3)',
          transform: `translateX(calc(${activeIndex} * (100% + 0.125rem)))`,
        }}
      />
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <Tooltip key={value} content={label} side="bottom">
          <button
            type="button"
            onClick={(event) => switchTo(value, event)}
            aria-label={label}
            aria-pressed={theme === value}
            className={cn(
              'relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-200',
              theme === value ? 'text-accent-foreground' : 'text-text-secondary hover:text-text-primary'
            )}
          >
            <Icon size={16} />
          </button>
        </Tooltip>
      ))}
    </div>
  );
};
