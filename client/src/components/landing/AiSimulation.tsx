import { useCallback, useEffect, useRef, useState } from 'react';
import { diffLines } from 'diff';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, FileQuestion, Wand2, Check, X, CornerDownLeft } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Kbd } from '../ui/Kbd';
import { cn } from '../../lib/utils';

type Mode = 'explain' | 'review' | 'refactor';

interface Script {
  text: string;
  before: string;
  after: string;
}

const ORIGINAL_CODE = `function fibonacci(n) {
  if (n < 2) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}`;

const SCRIPTS: Record<Mode, Script> = {
  explain: {
    text:
      '`fibonacci(n)` is the classic recursive definition.\n\nThe base case catches `n < 2`, returning `n` directly — that covers `fib(0) = 0` and `fib(1) = 1`.\n\nEvery other case is the sum of the two previous values, so the call tree branches twice per level. That gives **O(2ⁿ)** time complexity: `fib(35)` already does ~29 million calls.\n\nFor production code, memoize or iterate.',
    before: '',
    after: '',
  },
  review: {
    text:
      'Three things stand out:\n\n1. **Exponential complexity** — the recursion recomputes the same values repeatedly.\n\n2. **No input guard** — negative numbers recurse forever and blow the stack.\n\n3. **Hidden return type** — callers get `number` or `undefined` with no annotation.\n\nNone of these break the function, but the first two will bite under load. I can refactor if you want.',
    before: ORIGINAL_CODE,
    after: ORIGINAL_CODE,
  },
  refactor: {
    text:
      'Rewrote the recursion as an iterative loop with an explicit guard. Complexity drops from **O(2ⁿ)** to **O(n)**, the stack is safe for large inputs, and the return type is explicit.',
    before: ORIGINAL_CODE,
    after: `function fibonacci(n: number): number {
  if (n < 0) throw new RangeError('n must be non-negative');
  let previous = 0;
  let current = 1;
  for (let index = 0; index < n; index++) {
    [previous, current] = [current, previous + current];
  }
  return previous;
}`,
  },
};

const MODE_TABS: Array<{ value: Mode; label: string; icon: typeof Sparkles }> = [
  { value: 'explain', label: 'Explain', icon: FileQuestion },
  { value: 'review', label: 'Review', icon: Sparkles },
  { value: 'refactor', label: 'Refactor', icon: Wand2 },
];

/**
 * A scripted simulation of the real streaming AI panel. The production panel
 * streams tokens from Groq over Socket.io; here the responses are pre-written
 * and revealed with variable-speed typewriting so the demo works offline and
 * costs nothing. The diff at the end is real (the `diff` package) and Accept
 * really applies the change as a transaction to the local "document".
 */
export const AiSimulation = () => {
  const [mode, setMode] = useState<Mode>('explain');
  const [streamed, setStreamed] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [code, setCode] = useState(ORIGINAL_CODE);
  const [diffState, setDiffState] = useState<'pending' | 'applied' | 'rejected' | null>(null);
  const [applied, setApplied] = useState(false);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const outputRef = useRef<HTMLDivElement>(null);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const startStreaming = useCallback((next: Mode) => {
    clearTimers();
    setMode(next);
    setStreamed('');
    setStreaming(true);
    setDiffState(null);

    const script = SCRIPTS[next];
    const characters = [...script.text];
    let elapsed = 240;

    characters.forEach((character) => {
      const pause = /\n/.test(character) ? 130 : /[\s]/.test(character) ? 42 : 14 + Math.random() * 26;
      elapsed += pause;
      timers.current.push(
        setTimeout(() => {
          setStreamed((current) => current + character);
        }, elapsed)
      );
    });

    timers.current.push(
      setTimeout(
        () => {
          setStreaming(false);
          if (next === 'refactor') setDiffState('pending');
        },
        elapsed + 420
      )
    );
  }, []);

  // Keep the tab aligned with whichever mode actually ran.
  const handleTab = (next: Mode) => startStreaming(next);

  const handleAccept = () => {
    setCode(SCRIPTS.refactor.after);
    setDiffState('applied');
    setApplied(true);
  };

  const handleReject = () => setDiffState('rejected');

  // Auto-scroll the stream.
  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' });
  }, [streamed]);

  // Demo starts with "explain" once visible.
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          startStreaming('explain');
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    const node = outputRef.current;
    if (node) observer.observe(node);
    return () => {
      observer.disconnect();
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const diffParts =
    mode === 'refactor' && diffState
      ? diffLines(SCRIPTS.refactor.before, SCRIPTS.refactor.after)
      : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="accent" icon={<Sparkles size={11} />}>
          demo · scripted
        </Badge>
        <span className="text-xs text-text-secondary">
          The real panel streams from Groq over Socket.io — this preview is offline and free.
        </span>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-bg-secondary">
        {/* Mode tabs */}
        <div className="flex items-center gap-1 border-b border-border p-2">
          {MODE_TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleTab(value)}
              disabled={streaming}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                mode === value ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text-primary'
              )}
              aria-pressed={mode === value}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
          <span className="ml-auto pr-1">
            <Kbd>⌘↵</Kbd>
          </span>
        </div>

        {/* Streaming output */}
        <div
          ref={outputRef}
          className="scrollbar-thin h-72 overflow-y-auto border-b border-border p-4"
        >
          <div className="ai-output text-sm text-text-primary">
            {streamed}
            {streaming && <span className="caret" aria-hidden />}
          </div>
        </div>

        {/* Diff card */}
        <AnimatePresence>
          {mode === 'refactor' && diffState === 'pending' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Wand2 size={15} className="text-accent" /> Proposed changes
                  <span className="ml-auto text-xs font-normal text-text-secondary">applied as a Yjs transaction</span>
                </div>
                <DiffBlock parts={diffParts} />
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={handleAccept} className="flex-1">
                    <Check size={14} /> Accept
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handleReject} className="flex-1">
                    <X size={14} /> Reject
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Applied / rejected states */}
        {diffState === 'applied' && (
          <div className="flex items-center gap-2 bg-success/10 p-3 text-sm text-success">
            <Check size={15} />
            Applied as a Yjs transaction — every collaborator's editor updated.
          </div>
        )}
        {diffState === 'rejected' && (
          <div className="flex items-center gap-2 p-3 text-sm text-text-secondary">
            <X size={15} />
            Suggestion rejected — no changes were made.
          </div>
        )}
      </div>

      {applied && (
        <div className="rounded-card border border-border bg-bg-secondary p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            <CornerDownLeft size={12} /> document after accept
          </p>
          <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-text-primary">{code}</pre>
        </div>
      )}
    </div>
  );
};

interface DiffBlockProps {
  parts: ReturnType<typeof diffLines>;
}

const DiffBlock = ({ parts }: DiffBlockProps) => {
  let lineNumber = 1;
  return (
    <div className="overflow-hidden rounded-lg border border-border editor-surface">
      {parts.map((part, partIndex) => {
        const lines = part.value.split('\n');
        if (lines[lines.length - 1] === '') lines.pop();
        const startLine = lineNumber;
        lineNumber += lines.length;

        return (
          <div key={partIndex}>
            {lines.map((line, lineIndex) => (
              <div
                key={lineIndex}
                className={cn(
                  'flex gap-3 px-3 py-0.5 font-mono text-xs',
                  part.added && 'bg-success/12 text-success',
                  part.removed && 'bg-danger/12 text-danger',
                  !part.added && !part.removed && 'text-text-primary/80'
                )}
              >
                <span className="w-6 shrink-0 select-none text-right text-text-secondary/50">
                  {part.added ? '+' : part.removed ? '−' : startLine + lineIndex}
                </span>
                <span className="whitespace-pre">{line || ' '}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};
