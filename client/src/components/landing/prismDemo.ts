import { useEffect, useMemo, useState } from 'react';
import { themes, type Language, type PrismTheme } from 'prism-react-renderer';

/* ─────────────────────────────────────────────────────────────────────────
   Theme tokens → Prism themes. Read from CSS custom properties at render
   time so every Prism instance follows the active theme (including the scoped
   `data-theme` wrappers used by the "compare all three" playground).
   ───────────────────────────────────────────────────────────────────────── */

const readVar = (name: string, fallback?: string): string => {
  if (typeof window === 'undefined') return fallback ?? '';
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback || '';
};

/**
 * Prism theme shape (re-exported so consumers don't depend on the library's
 * own type directly).
 */
export type PrismStyle = PrismTheme;

/**
 * Builds a Prism theme object from the current CSS tokens. Called per-render
 * (cheap) so highlighted demos always match the theme they sit in.
 */
export const buildPrismTheme = (theme: 'light' | 'dark' | 'eyeshield' = 'dark'): PrismStyle => {
  const scoped = theme === 'light' ? themes.nightOwlLight : theme === 'dark' ? themes.nightOwl : themes.oneDark;

  const foreground = readVar('--text-primary', scoped.plain.color);
  const background = readVar('--code-bg', scoped.plain.backgroundColor);
  const comment = readVar('--text-secondary', '#8b8b96');
  const accent = readVar('--accent', '#8a8ef0');
  const accent2 = readVar('--accent-2', '#7dcfff');
  const stringToken = readVar('--success', '#9ece6a');

  return {
    plain: { color: foreground, backgroundColor: background },
    styles: [
      { types: ['comment', 'prolog', 'doctype', 'cdata'], style: { color: comment, fontStyle: 'italic' } },
      { types: ['punctuation'], style: { color: comment } },
      { types: ['keyword', 'operator', 'tag'], style: { color: accent } },
      { types: ['string', 'attr-value', 'char', 'inserted'], style: { color: stringToken } },
      { types: ['number', 'boolean', 'constant', 'symbol', 'deleted'], style: { color: accent2 } },
      { types: ['function', 'function-variable'], style: { color: accent2 } },
      { types: ['class-name', 'maybe-class-name'], style: { color: accent2 } },
      { types: ['variable', 'attr-name'], style: { color: foreground } },
      ...scoped.styles,
    ],
  };
};

/** The demos use TypeScript: ligature-friendly and familiar to every dev. */
export const DEMO_LANGUAGE: Language = 'tsx';

interface UseTypewriterArgs {
  lines: string[];
  /** Characters revealed per tick. */
  speed?: number;
  /** Delay before the loop restarts (ms). */
  restartDelay?: number;
  /** Disable entirely (reduced motion). */
  disabled?: boolean;
}

/**
 * Types `lines` out character-by-character, then clears and restarts — the
 * "code that types itself" motif. Returns the visible text and caret state.
 */
export const useTypewriter = ({ lines, speed = 28, restartDelay = 2600, disabled = false }: UseTypewriterArgs) => {
  const fullText = useMemo(() => lines.join('\n'), [lines]);
  const [count, setCount] = useState(disabled ? fullText.length : 0);
  const [done, setDone] = useState(disabled);

  useEffect(() => {
    if (disabled) {
      setCount(fullText.length);
      setDone(true);
      return;
    }

    setCount(0);
    setDone(false);

    let timer: ReturnType<typeof setTimeout>;
    let mounted = true;

    const tick = () => {
      if (!mounted) return;
      setCount((current) => {
        if (current >= fullText.length) {
          setDone(true);
          timer = setTimeout(() => {
            if (!mounted) return;
            setCount(0);
            setDone(false);
            timer = setTimeout(tick, speed);
          }, restartDelay);
          return current;
        }
        // Reveal 1-3 characters per tick for organic pacing.
        const step = 1 + Math.floor(Math.random() * 3);
        timer = setTimeout(tick, speed + Math.random() * 18);
        return Math.min(current + step, fullText.length);
      });
    };

    timer = setTimeout(tick, 450);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [fullText, speed, restartDelay, disabled]);

  const text = fullText.slice(0, count);
  return { text, done, showCaret: !done || disabled === false };
};

/** Pauses animation loops when the tab is hidden (battery friendly). */
export const useVisible = (): boolean => {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
};
