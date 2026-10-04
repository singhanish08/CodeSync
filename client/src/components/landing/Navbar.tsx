import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useScroll, useSpring } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ThemeToggle } from '../ThemeToggle';
import { Button } from '../ui/Button';
import { Kbd } from '../ui/Kbd';
import { cn } from '../../lib/utils';

const ANCHORS = [
  ['Features', '#features'],
  ['Live demo', '#live-demo'],
  ['How it works', '#how-it-works'],
  ['Stack', '#stack'],
] as const;

interface NavbarProps {
  /** Opens the command palette. */
  onOpenPalette: () => void;
}

/**
 * Sticky glass navbar. Shows the scroll-progress bar under itself, the theme
 * toggle, a ⌘K hint chip, and auth-aware CTAs. Mobile gets a full-screen menu.
 */
export const Navbar = ({ onOpenPalette }: NavbarProps) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 220, damping: 30, restDelta: 0.001 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile menu whenever the route changes.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={cn(
          'relative transition-[background-color,box-shadow] duration-300',
          scrolled ? 'glass border-b border-border shadow-soft' : 'border-b border-transparent'
        )}
      >
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-6">
          {/* Brand */}
          <Link to="/" className="group flex items-center gap-2.5 text-text-primary">
            <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-bg-secondary font-mono text-sm font-bold text-accent">
              {'</>'}
              <motion.span
                className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent"
                animate={{ opacity: [1, 0.2, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                aria-hidden
              />
            </span>
            <span className="font-display text-lg font-semibold">CodeSync</span>
          </Link>

          {/* Desktop anchors */}
          <nav className="hidden items-center gap-1 md:flex">
            {ANCHORS.map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
              >
                {label}
              </a>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenPalette}
              className="hidden h-9 items-center rounded-lg border border-border bg-bg-secondary px-2 text-sm text-text-secondary transition-colors hover:text-text-primary sm:inline-flex"
              aria-label="Open command palette"
            >
              <Kbd>⌘K</Kbd>
            </button>
            <ThemeToggle />
            {user ? (
              <>
                <Link to="/dashboard" className="hidden sm:block">
                  <Button size="sm" variant="secondary">
                    Dashboard
                  </Button>
                </Link>
                <Button size="sm" variant="ghost" onClick={handleLogout} className="hidden sm:inline-flex">
                  Log out
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" className="hidden sm:block">
                  <Button size="sm" variant="ghost">
                    Log in
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm" glow>
                    Get started
                  </Button>
                </Link>
              </>
            )}
            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-bg-secondary text-text-primary md:hidden"
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X size={17} /> : <Menu size={17} />}
            </button>
          </div>
        </div>

        {/* Scroll progress bar */}
        <motion.div
          className="absolute bottom-0 left-0 h-0.5 origin-left"
          style={{
            scaleX: progress,
            width: '100%',
            background: 'linear-gradient(to right, var(--accent), var(--accent-2), var(--accent-3))',
          }}
          aria-hidden
        />
      </div>

      {/* Mobile full-screen menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 top-16 z-40 bg-bg-primary/95 backdrop-blur-lg md:hidden"
          >
            <motion.nav
              className="flex h-full flex-col gap-2 p-6"
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } } }}
            >
              {ANCHORS.map(([label, href]) => (
                <motion.a
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  variants={{ hidden: { opacity: 0, x: -16 }, show: { opacity: 1, x: 0 } }}
                  className="border-b border-border py-4 font-display text-2xl font-semibold text-text-primary"
                >
                  {label}
                </motion.a>
              ))}
              <div className="mt-auto flex flex-col gap-3">
                {user ? (
                  <>
                    <Link to="/dashboard" onClick={() => setMenuOpen(false)}>
                      <Button className="w-full">Open dashboard</Button>
                    </Link>
                    <Button variant="secondary" onClick={handleLogout} className="w-full">
                      Log out
                    </Button>
                  </>
                ) : (
                  <>
                    <Link to="/signup" onClick={() => setMenuOpen(false)}>
                      <Button className="w-full" glow>
                        Get started
                      </Button>
                    </Link>
                    <Link to="/login" onClick={() => setMenuOpen(false)}>
                      <Button variant="secondary" className="w-full">
                        Log in
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
