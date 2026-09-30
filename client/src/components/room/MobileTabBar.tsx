import { Code2, Sparkles, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

export type MobileView = 'editor' | 'ai' | 'presence';

interface MobileTabBarProps {
  active: MobileView;
  onChange: (view: MobileView) => void;
  aiBadge?: number;
}

const TABS: Array<{ value: MobileView; label: string; icon: typeof Code2 }> = [
  { value: 'editor', label: 'Editor', icon: Code2 },
  { value: 'ai', label: 'AI Review', icon: Sparkles },
  { value: 'presence', label: 'People', icon: Users },
];

/**
 * Bottom tab bar for the room page on mobile. Each view takes the full screen
 * width — the editor and AI panel are never crammed side by side. The active
 * tab gets a sliding pill indicator and a springy tap.
 */
export const MobileTabBar = ({ active, onChange, aiBadge = 0 }: MobileTabBarProps) => (
  <nav className="relative flex shrink-0 border-t border-border bg-bg-primary pb-[env(safe-area-inset-bottom)] md:hidden">
    {TABS.map(({ value, label, icon: Icon }) => {
      const isActive = active === value;
      return (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={isActive}
          className={cn(
            'relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors',
            isActive ? 'text-accent' : 'text-text-secondary'
          )}
        >
          {isActive && (
            <motion.span
              layoutId="mobile-tab-pill"
              className="absolute inset-x-2 top-1 h-0.5 rounded-full bg-accent"
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              aria-hidden
            />
          )}
          <Icon size={20} />
          {label}
          {value === 'ai' && aiBadge > 0 && (
            <span className="absolute right-1/4 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
              {aiBadge}
            </span>
          )}
        </button>
      );
    })}
  </nav>
);
