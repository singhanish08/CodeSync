import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Kbd } from '../components/ui/Kbd';
import { useAuth } from '../contexts/AuthContext';

/**
 * Custom 404 — "a cursor lost in the file". Keeps the visual language of the
 * rest of the site: window chrome, blinking caret and monospace details.
 */
export const NotFound = () => {
  const { user } = useAuth();

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 py-20 text-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <div className="overflow-hidden rounded-card border border-border bg-bg-secondary shadow-lifted gradient-border">
          <div className="flex h-9 items-center gap-3 border-b border-border px-3">
            <div className="flex gap-1.5" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
            </div>
            <span className="flex-1 text-center font-mono text-[11px] text-text-secondary">404.tsx</span>
          </div>
          <div className="relative editor-surface p-6 text-left">
            <p className="font-mono text-sm leading-relaxed text-text-secondary">
              <span className="text-danger">error</span>: route <span className="text-text-primary">"{window.location.pathname}"</span>{' '}
              is not in this document.
            </p>
            <p className="mt-3 font-mono text-sm leading-relaxed text-text-secondary">
              the cursor blinks, waiting for a line that never comes
              <span className="caret" aria-hidden />
            </p>
            <span
              aria-hidden
              className="mt-4 inline-block h-4 w-0.5 rounded-full"
              style={{ backgroundColor: 'var(--cursor-2)' }}
            />
          </div>
        </div>

        <h1 className="mt-8 font-display text-3xl font-bold text-text-primary">Page not found</h1>
        <p className="mt-3 text-text-secondary">
          The link may be broken, or the room may have never existed. Nothing was deleted — promise.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to={user ? '/dashboard' : '/'}>
            <Button glow className="w-full sm:w-auto">
              <Home size={16} />
              Back to {user ? 'dashboard' : 'home'}
            </Button>
          </Link>
          <Link to="/">
            <Button variant="secondary" className="w-full sm:w-auto">
              Landing page
            </Button>
          </Link>
        </div>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-text-secondary">
          try the palette <Kbd>⌘K</Kbd>
        </p>
      </motion.div>
    </main>
  );
};
