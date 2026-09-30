import { motion } from 'framer-motion';
import { ArrowRight, Github, Twitter } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Button } from '../ui/Button';
import { ThemeToggle } from '../ThemeToggle';
import { cn, colorForUserId } from '../../lib/utils';
import { useEffect, useRef, useState } from 'react';

/**
 * The wandering "you" cursor — a small easter egg that follows the mouse with
 * a delay. Disabled on touch devices and reduced motion.
 */
const EasterEggCursor = () => {
  const ref = useRef<HTMLSpanElement>(null);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setEnabled(true);

    const onMove = (event: MouseEvent) => {
      target.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener('mousemove', onMove);

    let frame = 0;
    const loop = () => {
      current.current.x += (target.current.x - current.current.x) * 0.08;
      current.current.y += (target.current.y - current.current.y) * 0.08;
      if (ref.current) {
        ref.current.style.transform = `translate3d(${current.current.x + 14}px, ${current.current.y + 16}px, 0)`;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  if (!enabled) return null;

  return (
    <span
      ref={ref}
      className="pointer-events-none fixed left-0 top-0 z-50 hidden lg:block"
      aria-hidden
    >
      <span className="block h-4 w-0.5 rounded-full" style={{ backgroundColor: colorForUserId('you') }} />
      <span
        className="absolute left-0 top-4 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white"
        style={{ backgroundColor: colorForUserId('you') }}
      >
        you
      </span>
    </span>
  );
};

export const Footer = () => {
  const { user } = useAuth();
  const { theme } = useTheme();

  return (
    <>
      {/* ── Final CTA ── */}
      <section className="relative mx-auto w-full max-w-[1200px] px-6 py-20 sm:py-28">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-panel border border-border p-10 text-center sm:p-16 gradient-border"
        >
          {/* Themed glow panel behind the CTA */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 opacity-70"
            style={{
              background:
                theme === 'light'
                  ? 'radial-gradient(50% 120% at 50% 0%, color-mix(in srgb, var(--accent-2) 20%, transparent), transparent 70%)'
                  : theme === 'dark'
                    ? 'radial-gradient(50% 120% at 50% 0%, color-mix(in srgb, var(--accent) 28%, transparent), color-mix(in srgb, var(--accent-2) 12%, transparent) 55%, transparent 75%)'
                    : 'radial-gradient(50% 120% at 50% 0%, color-mix(in srgb, var(--accent) 26%, transparent), transparent 72%)',
            }}
          />
          <h2 className="mx-auto max-w-2xl font-display text-[clamp(1.75rem,5vw,3rem)] font-bold leading-[1.05] text-text-primary">
            Stop merging conflicts.
            <br />
            Start <span className="text-gradient">shipping in sync</span>.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-text-secondary">
            Free and open source. Bring your team, or just bring yourself — the AI is always in the room.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to={user ? '/dashboard' : '/signup'}>
              <Button size="lg" glow>
                {user ? 'Open dashboard' : 'Get started'}
                <ArrowRight size={17} className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </Button>
            </Link>
            <Link to={user ? '/dashboard' : '/login'}>
              <Button size="lg" variant="secondary">
                {user ? 'Your rooms' : 'Log in'}
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Link to="/" className="flex items-center gap-2 text-text-primary">
              <Mark />
              <span className="font-display text-lg font-semibold">CodeSync</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-text-secondary">
              A real-time collaborative code editor with an AI assistant in the room. Built as a
              portfolio project — honest, open source, no dark patterns.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:text-text-primary"
                aria-label="GitHub repository"
              >
                <Github size={16} />
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:text-text-primary"
                aria-label="X profile"
              >
                <Twitter size={16} />
              </a>
            </div>
          </div>

          <nav aria-label="Product">
            <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.15em] text-text-secondary">
              product
            </p>
            <ul className="space-y-2 text-sm">
              {[
                ['Features', '#features'],
                ['Live demo', '#live-demo'],
                ['How it works', '#how-it-works'],
                ['Architecture', '#stack'],
              ].map(([label, href]) => (
                <li key={href}>
                  <a href={href} className="text-text-secondary transition-colors hover:text-text-primary">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Account">
            <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.15em] text-text-secondary">
              account
            </p>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/login" className="text-text-secondary transition-colors hover:text-text-primary">
                  Log in
                </Link>
              </li>
              <li>
                <Link to="/signup" className="text-text-secondary transition-colors hover:text-text-primary">
                  Sign up
                </Link>
              </li>
              <li>
                <Link to="/forgot-password" className="text-text-secondary transition-colors hover:text-text-primary">
                  Reset password
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="border-t border-border">
          <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center justify-between gap-4 px-6 py-5 sm:flex-row">
            <p className="text-xs text-text-secondary">
              Built by <span className="font-medium text-text-primary">Anish</span> · React, Node, Yjs, Groq
            </p>
            <div className="flex items-center gap-4">
              <span className={cn('font-mono text-[10px] text-text-secondary')}>
                the cursor is following you
              </span>
              <ThemeToggle compact />
            </div>
          </div>
        </div>
      </footer>

      <EasterEggCursor />
    </>
  );
};

/** Small animated caret mark used in the footer and nav. */
const Mark = () => (
  <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg-secondary font-mono text-accent">
    {'</>'}
  </span>
);
