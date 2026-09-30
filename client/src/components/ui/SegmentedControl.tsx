import { type ReactNode, useRef } from 'react';
import { cn } from '../../lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
  /** Render a sliding highlight behind the active option (animated). */
  sliding?: boolean;
}

/**
 * Accessible segmented control. The sliding variant animates a highlight
 * between options using a CSS transform instead of layout-affecting props.
 */
export const SegmentedControl = <T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
  sliding = true,
}: SegmentedControlProps<T>) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeIndex = Math.max(
    options.findIndex((option) => option.value === value),
    0
  );

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Options"
      className={cn(
        'relative inline-flex items-center gap-0.5 rounded-control border border-border bg-bg-secondary p-0.5',
        className
      )}
    >
      {sliding && (
        <span
          aria-hidden
          className="absolute top-0.5 bottom-0.5 rounded-[10px] bg-accent shadow-soft transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            width: `calc((100% - 0.25rem) / ${options.length})`,
            transform: `translateX(calc(${activeIndex} * (100% + 0.125rem)))`,
          }}
        />
      )}
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative z-10 inline-flex flex-1 items-center justify-center gap-1.5 rounded-[10px] font-medium transition-colors duration-200',
              size === 'sm' ? 'h-8 px-2 text-xs' : 'h-9 px-3 text-sm',
              active ? 'text-accent-foreground' : 'text-text-secondary hover:text-text-primary'
            )}
          >
            {Icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
};
