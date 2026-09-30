import type { AppTheme } from '../types';

/**
 * A tiny decoupled bus so that Monaco's theme engine can follow app-theme
 * changes WITHOUT the ThemeContext importing monacoSetup (which would drag all
 * of Monaco into the landing-page bundle). Monaco subscribes lazily — the bus
 * has zero heavy dependencies and is safe to load everywhere.
 */

type ThemeListener = (theme: AppTheme) => void;

const listeners = new Set<ThemeListener>();

export const subscribeTheme = (listener: ThemeListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const emitThemeChange = (theme: AppTheme): void => {
  listeners.forEach((listener) => listener(theme));
};
