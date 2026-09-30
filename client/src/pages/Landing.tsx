import { lazy, Suspense, useState } from 'react';
import { Navbar } from '../components/landing/Navbar';
import { Hero } from '../components/landing/Hero';
import { LiveDemoStage } from '../components/landing/LiveDemoStage';
import { Footer } from '../components/landing/Footer';
import { CommandPalette } from '../components/landing/CommandPalette';

// Below-the-fold sections are lazily loaded so the first paint is fast and
// the landing page never pays for sections the visitor never scrolls to.
const FeatureBento = lazy(() =>
  import('../components/landing/FeatureBento').then((module) => ({ default: module.FeatureBento }))
);
const HowItWorks = lazy(() =>
  import('../components/landing/HowItWorks').then((module) => ({ default: module.HowItWorks }))
);
const Architecture = lazy(() =>
  import('../components/landing/Architecture').then((module) => ({ default: module.Architecture }))
);
const TechStack = lazy(() =>
  import('../components/landing/TechStack').then((module) => ({ default: module.TechStack }))
);

/**
 * The landing page. Renders entirely client-side: no socket connection, no API
 * call is required for any demo, so the page works instantly even while the
 * free-tier backend is asleep.
 */
export const Landing = () => {
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className="relative min-h-screen">
      {/* Theme backdrop + grain (fixed, behind everything) */}
      <div className="theme-backdrop" aria-hidden />
      <div className="theme-grain" aria-hidden />

      <Navbar onOpenPalette={() => setPaletteOpen(true)} />

      <main>
        <Hero />
        <LiveDemoStage />

        <Suspense fallback={<SectionFallback label="features" />}>
          <FeatureBento />
        </Suspense>
        <Suspense fallback={<SectionFallback label="how it works" />}>
          <HowItWorks />
        </Suspense>
        <Suspense fallback={<SectionFallback label="architecture" />}>
          <Architecture />
        </Suspense>
        <Suspense fallback={<SectionFallback label="stack" />}>
          <TechStack />
        </Suspense>
      </main>

      <Footer />

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
};

const SectionFallback = ({ label }: { label: string }) => (
  <div className="mx-auto flex h-64 max-w-[1200px] items-center justify-center px-6">
    <span className="font-mono text-sm text-text-secondary">
      loading {label}
      <span className="caret" aria-hidden />
    </span>
  </div>
);
