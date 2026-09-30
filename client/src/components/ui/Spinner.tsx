import { cn } from '../../lib/utils';

/** Branded caret spinner — a blinking cursor instead of a plain spinner. */
export const Spinner = ({ className }: { className?: string }) => (
  <span className={cn('inline-flex items-center', className)} role="status" aria-label="Loading">
    <span
      className="block h-6 w-1.5 animate-pulse-soft rounded-full bg-accent"
      style={{ transform: 'skewX(-6deg)' }}
    />
  </span>
);

/**
 * Larger branded loading mark: three caret bars blinking in sequence like a
 * blinking terminal cursor. Used by the "waking up the server" state.
 */
export const CaretLoader = ({ className }: { className?: string }) => (
  <span className={cn('inline-flex items-end gap-1', className)} role="status" aria-label="Loading">
    {[0, 1, 2].map((index) => (
      <span
        key={index}
        className="block w-1.5 animate-pulse-soft rounded-full bg-accent"
        style={{ height: `${1 - index * 0.22}rem`, animationDelay: `${index * 0.18}s` }}
      />
    ))}
  </span>
);
