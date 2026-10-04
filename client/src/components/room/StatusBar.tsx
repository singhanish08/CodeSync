import { Wifi, Users, Check } from 'lucide-react';
import type { AppTheme } from '../../types';
import { cn, THEME_LABELS } from '../../lib/utils';
import { LanguageSelect } from './LanguageSelect';

interface StatusBarProps {
  language: string;
  cursor: { line: number; column: number } | null;
  presenceCount: number;
  connected: boolean;
  theme: AppTheme;
  onLanguageChange: (language: string) => void;
  className?: string;
}

/**
 * VS Code-style bottom status bar. Reports where the cursor is, what language
 * is active, who is present and whether the document is synced.
 */
export const StatusBar = ({
  language,
  cursor,
  presenceCount,
  connected,
  theme,
  onLanguageChange,
  className,
}: StatusBarProps) => (
  <footer
    className={cn(
      'flex h-7 shrink-0 items-center gap-1 border-t border-border bg-bg-secondary px-2 text-[11px] text-text-secondary sm:px-3',
      className
    )}
  >
    <span className="inline-flex items-center gap-1.5">
      {connected ? (
        <>
          <Check size={11} className="text-success" />
          <span className="hidden sm:inline">Synced</span>
        </>
      ) : (
        <>
          <Wifi size={11} className="text-warning" />
          <span>Reconnecting…</span>
        </>
      )}
    </span>

    <span className="mx-1.5 h-3 w-px bg-border" aria-hidden />

    <LanguageSelect language={language} onLanguageChange={onLanguageChange} />

    <span className="mx-1.5 h-3 w-px bg-border" aria-hidden />

    {cursor && (
      <span className="hidden font-mono sm:inline">
        Ln {cursor.line}, Col {cursor.column}
      </span>
    )}

    <div className="ml-auto flex items-center gap-3">
      <span className="inline-flex items-center gap-1.5">
        <Users size={11} />
        <span className="font-mono">{presenceCount}</span>
        <span className="hidden sm:inline">in room</span>
      </span>
      <span className="hidden font-mono text-text-secondary/70 md:inline">{THEME_LABELS[theme]}</span>
    </div>
  </footer>
);
