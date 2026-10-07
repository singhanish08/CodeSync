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
  /** Milliseconds per revealed character. */
  speed?: number;
  /** Disable entirely (reduced motion). */
  disabled?: boolean;
}

/**
 * Types `lines` out one character at a time and then HOLDS the final text, so
 * the demo settles instead of looping back to an empty editor.
 *
 * The reveal runs on a single self-scheduling `setTimeout` created in this
 * effect and cleared on unmount. Nothing is ever scheduled from inside a
 * `setCount` updater: updaters must be pure, React double-invokes them under
 * StrictMode, and scheduling a timer there used to spawn a second chain on
 * every tick (the orphan was invisible because the `timer` binding was
 * overwritten). Those chains multiplied and each restarted on its own — the
 * strobing flicker was all of them clearing and retyping out of phase.
 */
export const useTypewriter = ({ lines, speed = 50, disabled = false }: UseTypewriterArgs) => {
  const fullText = useMemo(() => lines.join('\n'), [lines]);
  const [count, setCount] = useState(disabled ? fullText.length : 0);
  const [done, setDone] = useState(disabled);

  useEffect(() => {
    if (disabled || fullText.length === 0) {
      setCount(fullText.length);
      setDone(true);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let revealed = 0;
    let mounted = true;

    setCount(0);
    setDone(false);

    const typeNext = () => {
      if (!mounted) return;

      revealed += 1;
      setCount(revealed);

      if (revealed >= fullText.length) {
        setDone(true); // settled — nothing restarts, so the text stays put
        return;
      }

      timer = setTimeout(typeNext, speed);
    };

    timer = setTimeout(typeNext, 450);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [fullText, speed, disabled]);

  return { text: fullText.slice(0, count), done };
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
