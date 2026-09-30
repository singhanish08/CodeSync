import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { AppTheme } from '../types';

/** Class-name combiner: clsx for conditionals + tailwind-merge for conflicts. */
export const cn = (...classes: ClassValue[]): string => twMerge(clsx(classes));

/**
 * Collaborator cursor colours. In Eye Shield the palette is warm-only so the
 * room never emits blue/cyan light, matching the theme's promise.
 */
const CURSOR_CSS_VARS = [
  '--cursor-1', '--cursor-2', '--cursor-3', '--cursor-4',
  '--cursor-5', '--cursor-6', '--cursor-7', '--cursor-8',
] as const;

const FALLBACK_PALETTE = [
  '#8a8ef0', '#2fd4ee', '#f472b6', '#4ade80',
  '#facc15', '#fb923c', '#60a5fa', '#a78bfa',
];

/** Reads the active theme's cursor palette from the CSS custom properties. */
export const cursorPalette = (): string[] => {
  if (typeof window === 'undefined') return FALLBACK_PALETTE;
  const styles = getComputedStyle(document.documentElement);
  return CURSOR_CSS_VARS.map((variable, index) => {
    const value = styles.getPropertyValue(variable).trim();
    return value || FALLBACK_PALETTE[index];
  });
};

/** Maps an id (user id or name) to a stable cursor colour from the palette. */
export const colorForUserId = (userId: string): string => {
  const palette = cursorPalette();
  return palette[[...userId].reduce((acc, char) => acc + char.charCodeAt(0), 0) % palette.length];
};

/** Legacy export kept for any code referencing the old fixed palette name. */
export const AVATAR_PALETTE = FALLBACK_PALETTE;

/** Extracts initials for avatar fallbacks. */
export const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

/* ────────────── Uint8Array ↔ base64 (binary-safe Yjs transport) ────────────── */

export const uint8ToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunk = 0x8000; // avoid call-stack limits on large docs
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

export const base64ToUint8 = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** True when the user asks for reduced motion (animations get static fallbacks). */
export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** True for coarse pointers (touch) — disables parallax/spotlight effects. */
export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export const THEME_LABELS: Record<AppTheme, string> = {
  light: 'Studio Paper',
  dark: 'Midnight Aurora',
  eyeshield: 'Amber Terminal',
};
