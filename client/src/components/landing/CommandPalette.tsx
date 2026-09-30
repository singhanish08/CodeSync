import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import {
  Moon,
  Sun,
  ShieldCheck,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  Plus,
  Sparkles,
  Github,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Kbd } from '../ui/Kbd';
import { cn } from '../../lib/utils';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Theme = 'light' | 'dark' | 'eyeshield';

/**
 * Site-wide command palette (⌘K / Ctrl+K). Navigates, switches theme, and —
 * when signed in — offers room actions and logout. Styled as glass with
 * keycap hints on every row.
 */
export const CommandPalette = ({ open, onOpenChange }: CommandPaletteProps) => {
  const { user, logout } = useAuth();
  const { setTheme } = useTheme();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const close = useCallback(() => {
    onOpenChange(false);
    setSearch('');
  }, [onOpenChange]);

  // Global keybinding.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange, close]);

  const run = (action: () => void) => {
    close();
    action();
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-start justify-center p-4 pt-[14vh] sm:pt-[18vh]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} aria-hidden />
      <Command
        loop
        label="Command palette"
        className={cn(
          'relative w-full max-w-xl overflow-hidden rounded-panel border border-border',
          'glass shadow-lifted animate-[modal-pop_0.18s_cubic-bezier(0.22,1,0.36,1)]'
        )}
        shouldFilter
        value={search}
        onValueChange={setSearch}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <span className="h-4 w-0.5 animate-pulse-soft rounded-full bg-accent" aria-hidden />
          <Command.Input
            placeholder="Type a command or search…"
            className="h-14 flex-1 bg-transparent text-text-primary placeholder:text-text-secondary outline-none"
            autoFocus
          />
          <Kbd>esc</Kbd>
        </div>

        <Command.List className="scrollbar-thin max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="py-8 text-center text-sm text-text-secondary">
            No results.
          </Command.Empty>

          <Command.Group heading="Navigate" className="cmdk-group">
            <Item
              icon={<Home size={15} />}
              label="Home"
              hint="landing page"
              onSelect={() => run(() => navigate('/'))}
            />
            <Item
              icon={<LayoutDashboard size={15} />}
              label={user ? 'Dashboard' : 'Dashboard (sign in required)'}
              hint={user ? 'your rooms' : 'auth'}
              onSelect={() => run(() => navigate(user ? '/dashboard' : '/login'))}
            />
            <Item
              icon={<Sparkles size={15} />}
              label="Live demo"
              hint="CRDT playground"
              onSelect={() => run(() => navigate('/#live-demo'))}
            />
          </Command.Group>

          <Command.Group heading="Theme" className="cmdk-group">
            <Item
              icon={<Sun size={15} />}
              label="Light · Studio Paper"
              hint="theme"
              onSelect={() => run(() => setTheme('light' as Theme))}
            />
            <Item
              icon={<Moon size={15} />}
              label="Dark · Midnight Aurora"
              hint="theme"
              onSelect={() => run(() => setTheme('dark' as Theme))}
            />
            <Item
              icon={<ShieldCheck size={15} />}
              label="Eye Shield · Amber Terminal"
              hint="zero blue light"
              onSelect={() => run(() => setTheme('eyeshield' as Theme))}
            />
          </Command.Group>

          {user && (
            <Command.Group heading="Room" className="cmdk-group">
              <Item
                icon={<Plus size={15} />}
                label="Create a room"
                hint="dashboard"
                onSelect={() => run(() => navigate('/dashboard?new=1'))}
              />
              <Item
                icon={<LogOut size={15} />}
                label="Log out"
                hint={user.email}
                onSelect={() =>
                  run(async () => {
                    await logout();
                    navigate('/');
                  })
                }
              />
            </Command.Group>
          )}

          {!user && (
            <Command.Group heading="Account" className="cmdk-group">
              <Item icon={<LogIn size={15} />} label="Log in" onSelect={() => run(() => navigate('/login'))} />
              <Item
                icon={<Plus size={15} />}
                label="Create an account"
                onSelect={() => run(() => navigate('/signup'))}
              />
            </Command.Group>
          )}

          <Command.Group heading="More" className="cmdk-group">
            <Item
              icon={<Github size={15} />}
              label="View source on GitHub"
              hint="external"
              onSelect={() => run(() => window.open('https://github.com', '_blank', 'noopener,noreferrer'))}
            />
          </Command.Group>
        </Command.List>
      </Command>
    </div>,
    document.body
  );
};

interface ItemProps {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onSelect: () => void;
}

const Item = ({ icon, label, hint, onSelect }: ItemProps) => (
  <Command.Item
    onSelect={onSelect}
    className={cn(
      'group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm',
      'text-text-primary transition-colors',
      'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground'
    )}
  >
    <span className="text-text-secondary group-data-[selected=true]:text-accent-foreground">{icon}</span>
    <span className="flex-1">{label}</span>
    {hint && (
      <span className="font-mono text-[10px] text-text-secondary group-data-[selected=true]:text-accent-foreground">
        {hint}
      </span>
    )}
    <Kbd className="group-data-[selected=true]:border-transparent group-data-[selected=true]:text-accent-foreground">
      ↵
    </Kbd>
  </Command.Item>
);
