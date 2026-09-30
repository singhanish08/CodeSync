import { cn } from '../../lib/utils';

interface CursorFlagProps {
  name: string;
  color?: string;
  /** Position within the parent (the parent must be relative). */
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The signature collaborator cursor: a coloured caret plus a name flag.
 * Reused in the hero, auth pages, empty states and demos.
 */
export const CursorFlag = ({ name, color, className, style }: CursorFlagProps) => (
  <span className={cn('pointer-events-none absolute', className)} style={style}>
    <span
      aria-hidden
      className="block h-4 w-0.5 rounded-full"
      style={{ backgroundColor: color ?? 'var(--accent)' }}
    />
    <span
      className="absolute left-0 top-4 whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white shadow-soft"
      style={{ backgroundColor: color ?? 'var(--accent)' }}
    >
      {name}
    </span>
    <span className="sr-only">{name} is present</span>
  </span>
);
