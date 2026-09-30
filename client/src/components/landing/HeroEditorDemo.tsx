import { useEffect, useRef, useState } from 'react';
import { Highlight } from 'prism-react-renderer';
import { buildPrismTheme, DEMO_LANGUAGE, useTypewriter } from './prismDemo';
import { WindowChrome } from '../ui/WindowChrome';
import { Kbd } from '../ui/Kbd';
import { CursorFlag } from '../ui/CursorFlag';
import { cn, colorForUserId, prefersReducedMotion } from '../../lib/utils';

const DEMO_LINES = [
  '// CodeSync — everyone edits the same document.',
  'import { room } from "codesync";',
  '',
  'export async function pairProgram(): Promise<void> {',
  '  const session = await room.create({ name: "roadmap" });',
  '  session.ai.summon("review", selection);',
  '  await session.merge(); // conflict-free, always',
  '}',
];

interface RemoteCursor {
  id: string;
  name: string;
  color: string;
  row: number;
  col: number;
}

const CURSORS: RemoteCursor[] = [
  { id: 'u-alice', name: 'Alice', color: '', row: 4, col: 36 },
  { id: 'u-bob', name: 'Bob', color: '', row: 6, col: 24 },
];

interface HeroEditorDemoProps {
  className?: string;
  /** Compact variant for the auth showcase side panel. */
  compact?: boolean;
}

/**
 * The hero's live editor: a window-chrome framed TypeScript file that types
 * itself, with two collaborator cursors drifting and an AI suggestion chip.
 * Pure CSS/React — no Monaco, no network — so it works while the server
 * sleeps.
 */
export const HeroEditorDemo = ({ className, compact = false }: HeroEditorDemoProps) => {
  const reduced = useRef(prefersReducedMotion());
  const { text, done } = useTypewriter({
    lines: DEMO_LINES,
    speed: compact ? 34 : 24,
    disabled: reduced.current,
  });
  const [prismTheme, setPrismTheme] = useState(buildPrismTheme());

  // Follow theme changes.
  useEffect(() => {
    const observer = new MutationObserver(() => setPrismTheme(buildPrismTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const visibleLines = text.split('\n');
  const cursors = CURSORS.map((cursor) => ({
    ...cursor,
    color: colorForUserId(cursor.id),
  }));

  return (
    <WindowChrome
      title="roadmap.tsx — CodeSync"
      className={cn('w-full', className)}
      trailing={
        <span className="hidden items-center gap-1.5 sm:flex">
          <Kbd>⌘K</Kbd>
          <span className="text-[10px] text-success">● synced</span>
        </span>
      }
    >
      <div className="relative editor-surface">
        {/* Remote collaborator cursors — appear once typing reaches their line. */}
        {cursors.map((cursor) => {
          const lineIndex = Math.min(cursor.row, visibleLines.length - 1);
          if (lineIndex < 0) return null;
          const reached = visibleLines.length >= cursor.row;
          if (!reached) return null;
          return (
            <CursorFlag
              key={cursor.id}
              name={cursor.name}
              color={cursor.color}
              className="hidden sm:block"
              style={{
                top: `calc(${lineIndex + 1} * 1.55rem + 0.5rem)`,
                left: `calc(${cursor.col} * 0.6ch + 3.25rem)`,
              }}
            />
          );
        })}

        <div className="overflow-x-auto p-3 text-[12.5px] leading-[1.55rem] sm:text-[13px]">
          <Highlight theme={prismTheme} code={text} language={DEMO_LANGUAGE}>
            {({ className: preClassName, style, tokens, getLineProps, getTokenProps }) => (
              <pre className={preClassName} style={{ ...style, background: 'transparent', margin: 0 }}>
                {tokens.map((line, lineIndex) => {
                  const lineProps = getLineProps({ line });
                  return (
                    <div
                      {...lineProps}
                      key={lineIndex}
                      className={cn(lineProps.className, 'table-row')}
                      style={{ ...lineProps.style, display: 'table-row' }}
                    >
                      <span className="table-cell select-none pr-4 text-right text-text-secondary/50">
                        {lineIndex + 1}
                      </span>
                      <span className="table-cell whitespace-pre">
                        {line.map((token, tokenIndex) => (
                          <span key={tokenIndex} {...getTokenProps({ token })} />
                        ))}
                        {lineIndex === visibleLines.length - 1 && !done && (
                          <span className="caret" aria-hidden />
                        )}
                      </span>
                    </div>
                  );
                })}
              </pre>
            )}
          </Highlight>
        </div>

        {/* AI suggestion chip — appears after the typing settles. */}
        <div
          className={cn(
            'absolute bottom-3 right-3 max-w-[15rem] rounded-lg border border-border bg-bg-secondary/90 p-2.5 shadow-lifted backdrop-blur transition-all duration-500',
            done ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
          )}
        >
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
            AI · review
          </p>
          <p className="mt-1 text-[11px] leading-snug text-text-secondary">
            “Consider adding a timeout to <code className="font-mono">session.merge()</code>.”
          </p>
        </div>
      </div>
    </WindowChrome>
  );
};
