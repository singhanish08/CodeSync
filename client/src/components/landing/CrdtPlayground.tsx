import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { Highlight } from 'prism-react-renderer';
import { motion } from 'framer-motion';
import { Zap, Check, Gauge } from 'lucide-react';
import { buildPrismTheme, DEMO_LANGUAGE } from './prismDemo';
import { Button } from '../ui/Button';
import { Kbd } from '../ui/Kbd';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';

/* ─────────────────────────────────────────────────────────────────────────
   A REAL Yjs playground. Two separate Y.Doc instances are synced to each
   other purely in-memory via update events — the same CRDT merge the product
   uses over the wire. Nothing here is faked: type in either pane and the other
   converges; "Simulate conflict" edits the same line from both docs at once
   and they still end up byte-identical.
   ───────────────────────────────────────────────────────────────────────── */

const STARTER = `function fibonacci(n) {
  if (n < 2) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}`;

type PaneId = 'alice' | 'bob';

interface CrdtPlaygroundProps {
  /** Optional class on the outer wrapper. */
  className?: string;
}

export const CrdtPlayground = ({ className }: CrdtPlaygroundProps) => {
  const docs = useRef<{ alice: Y.Doc; bob: Y.Doc } | null>(null);
  const texts = useRef<{ alice: Y.Text; bob: Y.Text } | null>(null);
  const [delay, setDelay] = useState(0);
  const [identical, setIdentical] = useState(true);
  const [conflictFlash, setConflictFlash] = useState<PaneId | null>(null);
  const [prismTheme, setPrismTheme] = useState(buildPrismTheme());

  // The two docs are created once and wired together via update events.
  // An artificial delay queue simulates network latency.
  const pending = useRef<Array<{ pane: PaneId; update: Uint8Array; sentAt: number }>>([]);

  if (!docs.current) {
    const alice = new Y.Doc();
    const bob = new Y.Doc();
    docs.current = { alice, bob };
    texts.current = { alice: alice.getText('content'), bob: bob.getText('content') };
  }

  // Display state: plain strings, updated from each doc's observe callback.
  const [content, setContent] = useState<{ alice: string; bob: string }>({ alice: STARTER, bob: STARTER });

  useEffect(() => {
    const { alice, bob } = docs.current!;
    const aliceText = alice.getText('content');
    const bobText = bob.getText('content');

    aliceText.insert(0, STARTER);
    // Keep bob in sync with the seed without echoing back.
    Y.applyUpdate(bob, Y.encodeStateAsUpdate(alice), 'remote');

    const forward = (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return;
      pending.current.push({ pane: 'alice', update, sentAt: performance.now() });
    };
    const backward = (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return;
      pending.current.push({ pane: 'bob', update, sentAt: performance.now() });
    };

    alice.on('update', forward);
    bob.on('update', backward);

    const render = () => {
      setContent({ alice: aliceText.toString(), bob: bobText.toString() });
      setIdentical(aliceText.toString() === bobText.toString());
    };
    alice.on('afterTransaction', render);
    bob.on('afterTransaction', render);
    render();

    return () => {
      alice.off('update', forward);
      bob.off('update', backward);
      alice.off('afterTransaction', render);
      bob.off('afterTransaction', render);
    };
  }, []);

  // Latency pump: flushes queued updates once their delay has elapsed.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const flush = () => {
      const now = performance.now();
      const ready = pending.current.filter((entry) => now - entry.sentAt >= delay);
      if (ready.length) {
        pending.current = pending.current.filter((entry) => now - entry.sentAt < delay);
        ready.forEach(({ pane, update }) => {
          const target = pane === 'alice' ? docs.current!.bob : docs.current!.alice;
          Y.applyUpdate(target, update, 'remote');
        });
      }
    };

    timer = setInterval(flush, 50);
    return () => clearInterval(timer);
  }, [delay]);

  // Follow theme changes for the Prism highlighting.
  useEffect(() => {
    const observer = new MutationObserver(() => setPrismTheme(buildPrismTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const handleChange = useCallback((pane: PaneId, value: string) => {
    const text = texts.current![pane];
    text.doc?.transact(() => {
      text.delete(0, text.length);
      text.insert(0, value);
    });
  }, []);

  const simulateConflict = useCallback(() => {
    const { alice, bob } = docs.current!;
    const aliceText = alice.getText('content');
    const bobText = bob.getText('content');
    const lines = aliceText.toString().split('\n');

    // Both users rewrite the SAME line at the SAME moment.
    const target = 1;
    const aliceLines = [...lines];
    const bobLines = [...lines];
    aliceLines[target] = '  const a = 0, b = 1, next = 0;';
    bobLines[target] = '  let [a, b] = [0, 1];';

    alice.transact(() => {
      aliceText.delete(0, aliceText.length);
      aliceText.insert(0, aliceLines.join('\n'));
    });
    bob.transact(() => {
      bobText.delete(0, bobText.length);
      bobText.insert(0, bobLines.join('\n'));
    });

    setConflictFlash('alice');
    window.setTimeout(() => setConflictFlash('bob'), 180);
    window.setTimeout(() => setConflictFlash(null), 900);
  }, []);

  const DELAYS = [0, 400, 1200];

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="accent" icon={<Zap size={11} />}>
          Real Yjs CRDT
        </Badge>
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-secondary p-0.5">
          <Gauge size={13} className="ml-2 text-text-secondary" />
          {DELAYS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDelay(value)}
              className={cn(
                'rounded-md px-2.5 py-1 font-mono text-[11px] transition-colors',
                delay === value ? 'bg-accent text-accent-foreground' : 'text-text-secondary hover:text-text-primary'
              )}
              aria-pressed={delay === value}
            >
              {value}ms
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-xs font-medium transition-colors',
              identical ? 'text-success' : 'text-warning'
            )}
          >
            <motion.span
              key={identical ? 'same' : 'diff'}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full"
              style={{ backgroundColor: identical ? 'color-mix(in srgb, var(--success) 20%, transparent)' : 'color-mix(in srgb, var(--warning) 20%, transparent)' }}
            >
              {identical ? <Check size={11} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            </motion.span>
            documents {identical ? 'identical' : 'converging…'}
          </span>
          <Button size="sm" variant="secondary" onClick={simulateConflict}>
            <Zap size={13} />
            Simulate conflict
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(['alice', 'bob'] as const).map((pane) => (
          <Pane
            key={pane}
            pane={pane}
            value={content[pane]}
            onChange={handleChange}
            flash={conflictFlash === pane}
            prismTheme={prismTheme}
          />
        ))}
      </div>

      <p className="text-xs leading-relaxed text-text-secondary">
        Both panes are independent {`Y.Doc`} instances merged with the same CRDT algorithm the product uses over
        Socket.io. Edit either one, or hit <span className="font-medium text-text-primary">Simulate conflict</span> —
        both users rewrite line 2 simultaneously and still converge to one document. Toggle the latency to watch
        updates arrive late and merge cleanly. <Kbd>⌘↵</Kbd> summons the AI in the real app.
      </p>
    </div>
  );
};

interface PaneProps {
  pane: PaneId;
  value: string;
  onChange: (pane: PaneId, value: string) => void;
  flash: boolean;
  prismTheme: ReturnType<typeof buildPrismTheme>;
}

const Pane = ({ pane, value, onChange, flash, prismTheme }: PaneProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorColor = `var(--cursor-${pane === 'alice' ? 1 : 2})`;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-card border bg-bg-secondary transition-colors',
        flash ? 'border-accent' : 'border-border'
      )}
    >
      <div className="flex h-8 items-center gap-2 border-b border-border px-3">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cursorColor }} />
        <span className="font-mono text-[11px] font-medium text-text-primary">{pane}</span>
        <span className="ml-auto font-mono text-[10px] text-text-secondary">editor</span>
      </div>
      <div className="relative editor-surface">
        {/* Highlight layer */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden p-3 text-[12.5px] leading-[1.6]">
          <Highlight theme={prismTheme} code={value} language={DEMO_LANGUAGE}>
            {({ tokens, getLineProps, getTokenProps }) => (
              <pre style={{ margin: 0, background: 'transparent' }}>
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
        {/* Transparent textarea on top — caret and selection visible, typed text invisible */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(pane, event.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label={`${pane} editor`}
          className={cn(
            'relative h-56 w-full resize-none bg-transparent p-3 font-mono text-[12.5px] leading-[1.6]',
            'text-transparent caret-current outline-none',
            'selection:bg-accent/30'
          )}
          style={{ caretColor: cursorColor }}
        />
      </div>
    </div>
  );
};
