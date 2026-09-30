import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppTheme } from '../types';
import { emitThemeChange } from '../lib/themeBus';

const STORAGE_KEY = 'codesync-theme';

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  cycleTheme: () => void;
  /** Switch theme with a circular View Transition reveal from a point. */
  transitionToTheme: (theme: AppTheme, origin?: { x: number; y: number }) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const getInitialTheme = (): AppTheme => {
  if (typeof window === 'undefined') return 'dark';

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'eyeshield') return stored;

  // Fall back to the OS preference when there is no stored choice.
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const META_COLORS: Record<AppTheme, string> = {
  light: '#fcfcfd',
  dark: '#0b0c12',
  eyeshield: '#241d17',
};

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const ThemeProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [theme, setThemeState] = useState<AppTheme>(getInitialTheme);
  const themeRef = useRef<AppTheme>(theme);

  const applyTheme = useCallback((next: AppTheme) => {
    themeRef.current = next;
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(STORAGE_KEY, next);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', META_COLORS[next]);

    // Notify lazy subscribers (Monaco) without importing it here.
    emitThemeChange(next);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  const setTheme = useCallback((next: AppTheme) => setThemeState(next), []);

  /**
   * Switch theme with a circular reveal expanding from `origin` (usually the
   * toggle button). Uses the View Transitions API where available and falls
   * back to an instant swap elsewhere. Respects reduced-motion.
   */
  const transitionToTheme = useCallback(
    (next: AppTheme, origin?: { x: number; y: number }) => {
      if (themeRef.current === next) return;

      const doc = document as Document & {
        startViewTransition?: (cb: () => void) => void;
      };

      if (
        typeof doc.startViewTransition !== 'function' ||
        prefersReducedMotion() ||
        typeof window === 'undefined'
      ) {
        setThemeState(next);
        return;
      }

      const x = origin?.x ?? window.innerWidth / 2;
      const y = origin?.y ?? window.innerHeight / 2;
      const root = document.documentElement;
      root.style.setProperty('--theme-tx', `${x}px`);
      root.style.setProperty('--theme-ty', `${y}px`);

      doc.startViewTransition(() => {
        setThemeState(next);
      });
    },
    []
  );

  const cycleTheme = useCallback(
    () => setThemeState((current) => (current === 'light' ? 'dark' : current === 'dark' ? 'eyeshield' : 'light')),
    []
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, cycleTheme, transitionToTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
