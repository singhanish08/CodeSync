import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X, Code2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';

interface HeaderProps {
  /** When true, render a floating version for the auth screens. */
  floating?: boolean;
}

export const Header = ({ floating = false }: HeaderProps) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (floating) {
    // Auth screens: no nav, just the brand and the theme toggle.
    return (
      <header className="fixed inset-x-0 top-0 z-20 flex items-center justify-between p-4">
        <div className="flex items-center gap-2 text-text-primary">
          <Code2 className="text-accent" size={24} />
          <span className="text-lg font-semibold">CodeSync</span>
        </div>
        <ThemeToggle />
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg-primary/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to={user ? '/dashboard' : '/login'} className="flex items-center gap-2 text-text-primary">
          <Code2 className="text-accent" size={22} />
          <span className="text-lg font-semibold">CodeSync</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-3 md:flex">
          {user && (
            <>
              <span className="text-sm text-text-secondary">{user.displayName}</span>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut size={16} /> Log out
              </Button>
            </>
          )}
          <ThemeToggle />
        </div>

        {/* Mobile hamburger */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle compact />
          {user && (
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-bg-secondary text-text-primary"
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          )}
        </div>
      </div>

      {/* Mobile dropdown */}
      {user && (
        <div
          className={cn(
            'border-b border-border bg-bg-primary md:hidden',
            menuOpen ? 'block' : 'hidden'
          )}
        >
          <div className="flex flex-col gap-2 px-4 py-3">
            <span className="text-sm text-text-secondary">{user.displayName}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="justify-start">
              <LogOut size={16} /> Log out
            </Button>
          </div>
        </div>
      )}
    </header>
  );
};
