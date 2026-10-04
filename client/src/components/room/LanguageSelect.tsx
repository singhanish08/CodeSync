import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronUp } from 'lucide-react';
import { LANGUAGES, languageLabel } from '../../lib/languages';
import { cn } from '../../lib/utils';

interface LanguageSelectProps {
  language: string;
  onLanguageChange: (language: string) => void;
  /** Which way the list opens — up from a bottom bar, down inside a modal. */
  align?: 'up' | 'down';
  triggerClassName?: string;
  'aria-label'?: string;
}

/**
 * Language picker. A native <select>'s <option> colours are forcibly overridden
 * by the OS, which left the entries near-invisible in several themes, so this
 * is a small custom dropdown that renders entirely with theme tokens.
 */
export const LanguageSelect = ({
  language,
  onLanguageChange,
  align = 'up',
  triggerClassName,
  ...rest
}: LanguageSelectProps) => {
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
        className={cn(
          'inline-flex items-center gap-1 rounded px-1 font-mono text-[11px] transition-colors',
          open ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
          triggerClassName
        )}
        {...rest}
      >
        {languageLabel(language)}
        <ChevronUp size={11} className={cn('transition-transform', open ? '' : 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: align === 'up' ? 4 : -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: align === 'up' ? 4 : -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className={cn(
              'absolute z-[110] max-h-64 w-36 overflow-y-auto rounded-card border border-border bg-bg-secondary p-1 shadow-lifted',
              align === 'up' ? 'bottom-full left-0 mb-1' : 'top-full left-0 mt-1'
            )}
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
                    {languageLabel(lang)}
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
