import { useEffect, useState } from 'react';
import { Highlight } from 'prism-react-renderer';
import { Sun, Moon, ShieldCheck, Columns2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import type { AppTheme } from '../../types';
import { buildPrismTheme, DEMO_LANGUAGE } from './prismDemo';
import { cn, THEME_LABELS } from '../../lib/utils';

const SAMPLE = `const theme = {
  name: "codesync",
  cursor: "#8a8ef0",
  ai: { model: "openai/gpt-oss-120b" },
};`;

const THEMES: Array<{ value: AppTheme; label: string; icon: typeof Sun; blurb: string }> = [
  { value: 'light', label: 'Studio Paper', icon: Sun, blurb: 'Editorial, airy, confident' },
  { value: 'dark', label: 'Midnight Aurora', icon: Moon, blurb: 'Cinematic, glowing, high-tech' },
  { value: 'eyeshield', label: 'Amber Terminal', icon: ShieldCheck, blurb: 'Warm phosphor, zero blue light' },
];

const SCOPED_TOKENS: Record<AppTheme, { bg: string; fg: string; accent: string; codeBg: string; swatches: string[] }> = {
  light: {
    bg: '#fcfcfd',
    fg: '#14141b',
    accent: '#5b5fc7',
    codeBg: '#f7f7fb',
    swatches: ['#fcfcfd', '#f4f4f7', '#5b5fc7', '#7c5cff', '#f0715e'],
  },
  dark: {
    bg: '#0b0c12',
    fg: '#e9e9f1',
    accent: '#8a8ef0',
    codeBg: '#111219',
    swatches: ['#0b0c12', '#141521', '#8a8ef0', '#2fd4ee', '#f472b6'],
  },
  eyeshield: {
    bg: '#241d17',
    fg: '#e8dcc4',
    accent: '#d4a35f',
    codeBg: '#1c1610',
    swatches: ['#241d17', '#2e251d', '#d4a35f', '#c9803f', '#8a9a5b'],
  },
};

/**
 * Theme playground. Switching a button re-themes the whole site live; the
 * "Compare all three" toggle renders three mini editors simultaneously using
 * scoped `data-theme` wrappers (CSS custom properties cascade into each box).
 */
export const ThemePlayground = () => {
  const { theme, setTheme } = useTheme();
  const [compare, setCompare] = useState(false);
  const [prismTheme, setPrismTheme] = useState(buildPrismTheme());

  useEffect(() => {
    const observer = new MutationObserver(() => setPrismTheme(buildPrismTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-secondary p-0.5">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              aria-pressed={theme === value}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                theme === value ? 'bg-accent text-accent-foreground' : 'text-text-secondary hover:text-text-primary'
              )}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCompare((value) => !value)}
          aria-pressed={compare}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors',
            compare ? 'border-accent text-accent' : 'text-text-secondary hover:text-text-primary'
          )}
        >
          <Columns2 size={13} />
          Compare all three
        </button>
        {!compare && (
          <span className="text-xs text-text-secondary">
            Live: <span className="font-medium text-text-primary">{THEME_LABELS[theme]}</span> — your choice is saved.
          </span>
        )}
      </div>

      {compare ? (
        <div className="grid gap-4 md:grid-cols-3">
          {THEMES.map(({ value, label, icon: Icon, blurb }) => {
            const tokens = SCOPED_TOKENS[value];
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className="group overflow-hidden rounded-card border border-border text-left transition-shadow hover:shadow-lifted"
                style={{ backgroundColor: tokens.bg, color: tokens.fg }}
              >
                <div
                  className="flex items-center gap-2 border-b px-3 py-2"
                  style={{ borderColor: 'color-mix(in srgb, currentColor 14%, transparent)' }}
                >
                  <Icon size={13} style={{ color: tokens.accent }} />
                  <span className="text-xs font-semibold">{label}</span>
                  {theme === value && (
                    <span
                      className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: tokens.accent, color: tokens.bg }}
                    >
                      ACTIVE
                    </span>
                  )}
                </div>
                <div className="p-3" style={{ backgroundColor: tokens.codeBg }}>
                  <pre className="overflow-x-auto font-mono text-[10.5px] leading-relaxed" style={{ color: tokens.fg }}>
                    {SAMPLE}
                  </pre>
                </div>
                <div className="flex gap-1.5 px-3 py-2.5">
                  {tokens.swatches.map((swatch, index) => (
                    <span
                      key={index}
                      className="h-4 w-4 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                  <span className="ml-auto text-[10px] opacity-60">{blurb}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-bg-secondary">
          <div className="flex h-8 items-center gap-2 border-b border-border px-3">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="font-mono text-[11px] text-text-secondary">theme.ts — {THEME_LABELS[theme]}</span>
          </div>
          <div className="editor-surface p-3">
            <Highlight theme={prismTheme} code={SAMPLE} language={DEMO_LANGUAGE}>
              {({ tokens, getLineProps, getTokenProps }) => (
                <pre style={{ margin: 0, background: 'transparent' }} className="overflow-x-auto font-mono text-xs leading-relaxed">
                  {tokens.map((line, lineIndex) => {
                    const lineProps = getLineProps({ line });
                    return (
                      <div key={lineIndex} {...lineProps} style={{ ...lineProps.style, background: 'transparent' }}>
                        {line.map((token, tokenIndex) => (
                          <span key={tokenIndex} {...getTokenProps({ token })} />
                        ))}
                      </div>
                    );
                  })}
                </pre>
              )}
            </Highlight>
          </div>
        </div>
      )}
    </div>
  );
};
