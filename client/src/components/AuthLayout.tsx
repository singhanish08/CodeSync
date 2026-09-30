import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';
import { HeroEditorDemo } from './landing/HeroEditorDemo';

/**
 * Desktop split layout: form side + a showcase side running a compact live
 * editor animation with collaborator cursors. Mobile drops the showcase and
 * keeps the theme toggle.
 */
export const AuthLayout = ({ children }: { children: ReactNode }) => (
  <div className="relative flex min-h-screen bg-bg-primary">
    <div className="theme-backdrop" aria-hidden />

    {/* Floating brand + theme toggle, visible on every breakpoint */}
    <header className="fixed inset-x-0 top-0 z-20 flex items-center justify-between p-4">
      <Link to="/" className="flex items-center gap-2 text-text-primary">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg-secondary font-mono text-sm font-bold text-accent">
          {'</>'}
        </span>
        <span className="font-display text-lg font-semibold">CodeSync</span>
      </Link>
      <ThemeToggle />
    </header>

    {/* Showcase side — hidden below lg */}
    <div className="relative hidden w-1/2 items-center justify-center overflow-hidden p-12 lg:flex">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(40rem 30rem at 60% 20%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 70%)',
        }}
      />
      <div className="relative w-full max-w-md">
        <HeroEditorDemo compact />
        <p className="mt-6 text-center text-sm text-text-secondary">
          Live editing, real cursors, an AI in the room —{' '}
          <Link to="/" className="font-medium text-accent hover:underline">
            see it in action
          </Link>
        </p>
      </div>
    </div>

    {/* Form side */}
    <div className="flex w-full items-center justify-center px-6 py-12 sm:px-12 lg:w-1/2">
      <div className="w-full max-w-sm pt-10 lg:pt-0">{children}</div>
    </div>
  </div>
);
