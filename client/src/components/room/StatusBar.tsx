import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Wifi, Users, Check, ChevronUp } from 'lucide-react';
import type { AppTheme } from '../../types';
import { cn, THEME_LABELS } from '../../lib/utils';

interface StatusBarProps {
  language: string;
  cursor: { line: number; column: number } | null;
  presenceCount: number;
  connected: boolean;
  theme: AppTheme;
  onLanguageChange: (language: string) => void;
  className?: string;
}

const LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'cpp',
  'java',
  'go',
  'rust',
  'c',
  'ruby',
  'php',
  'json',
  'html',
  'css',
  'markdown',
  'bash',
];

const PRETTY: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  cpp: 'C++',
  java: 'Java',
  go: 'Go',
  rust: 'Rust',
  c: 'C',
  ruby: 'Ruby',
  php: 'PHP',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  markdown: 'Markdown',
  bash: 'Bash',
};

/**
 * Language picker. A native <select>'s <option> colours are forcibly overridden
 * by the OS, which left the entries near-invisible in several themes, so this
 * is a small custom dropdown that renders entirely with theme tokens. It opens
 * upward from the status bar so it never collides with the AI panel.
 */
const LanguageSelect = ({ language, onLanguageChange }: { language: string; onLanguageChange: (language: string) => void }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Language"
        className={cn(
          'inline-flex items-center gap-1 rounded px-1 font-mono text-[11px] transition-colors',
          open ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
        )}
      >
        {PRETTY[language] ?? language}
        <ChevronUp size={11} className={cn('transition-transform', open ? '' : 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="absolute bottom-full left-0 z-[110] mb-1 max-h-64 w-36 overflow-y-auto rounded-card border border-border bg-bg-secondary p-1 shadow-lifted"
          >
            {LANGUAGES.map((lang) => {
              const selected = lang === language;
              return (
                <li key={lang} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => {
                      onLanguageChange(lang);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left font-mono text-[11px] transition-colors',
                      selected
                        ? 'bg-accent/15 text-text-primary'
                        : 'text-text-secondary hover:bg-accent/10 hover:text-text-primary'
                    )}
                  >
                    {PRETTY[lang] ?? lang}
                    {selected && <Check size={11} className="text-accent" />}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};

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
