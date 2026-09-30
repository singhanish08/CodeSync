import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Users, Sparkles, Palette } from 'lucide-react';
import { SegmentedControl } from '../ui/SegmentedControl';
import { CrdtPlayground } from './CrdtPlayground';
import { ThemePlayground } from './ThemePlayground';

// The AI simulation is the heaviest of the three demos — load it lazily so the
// interactive CRDT playground (visible by default) renders first.
const AiSimulation = lazy(() =>
  import('./AiSimulation').then((module) => ({ default: module.AiSimulation }))
);

type Tab = 'crdt' | 'ai' | 'theme';

const TABS: Array<{ value: Tab; label: string; icon: ReactNode }> = [
  { value: 'crdt', label: 'CRDT playground', icon: <Users size={14} /> },
  { value: 'ai', label: 'AI assistant', icon: <Sparkles size={14} /> },
  { value: 'theme', label: 'Themes', icon: <Palette size={14} /> },
];

/**
 * Section B — the "wow" section. Three fully client-side demos, tabbed so each
 * one owns the full width. None of them touch the network, so the page works
 * instantly even when the free-tier server is asleep.
 */
export const LiveDemoStage = () => {
  const [tab, setTab] = useState<Tab>('crdt');

  return (
    <section id="live-demo" className="relative mx-auto w-full max-w-[1200px] px-6 py-20 sm:py-28">
      <div className="mb-10 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            // live demo
          </p>
          <h2 className="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-bold text-text-primary">
            Try the engine, <span className="text-gradient">right here</span>
          </h2>
          <p className="mt-3 max-w-xl text-text-secondary">
            No signup, no server round-trip. This is the real Yjs CRDT and the real diff view, running
            client-side in your browser.
          </p>
        </div>
        <SegmentedControl
          options={TABS}
          value={tab}
          onChange={setTab}
          size="sm"
          className="w-full sm:w-auto"
        />
      </div>

      <div className="rounded-panel border border-border bg-bg-primary/60 p-4 sm:p-6 glass gradient-border">
        {tab === 'crdt' && <CrdtPlayground />}
        {tab === 'ai' && (
          <Suspense
            fallback={
              <div className="flex h-72 items-center justify-center text-text-secondary">
                <span className="caret" aria-hidden /> loading demo…
              </div>
            }
          >
            <AiSimulation />
          </Suspense>
        )}
        {tab === 'theme' && <ThemePlayground />}
      </div>
    </section>
  );
};
