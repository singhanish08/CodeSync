import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, Users, ScrollText, Activity, ShieldHalf } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import { ThemeToggle } from '../components/ThemeToggle';
import { cn } from '../lib/utils';
import { AdminOverview } from '../components/admin/AdminOverview';
import { AdminRooms } from '../components/admin/AdminRooms';
import { AdminUsers } from '../components/admin/AdminUsers';
import { AdminActivity } from '../components/admin/AdminActivity';

export type AdminTab = 'overview' | 'rooms' | 'users' | 'activity';

const TABS: Array<{ id: AdminTab; label: string; icon: typeof Users }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'rooms', label: 'Rooms', icon: Users },
  { id: 'users', label: 'Users', icon: ScrollText },
  { id: 'activity', label: 'Activity', icon: Activity },
];

/**
 * Admin panel. Reachable only through AdminRoute (which checks role ===
 * 'admin'), and every data call it makes is re-checked against the DB by
 * requireAdmin on the server — so even a stale client role cannot read or
 * change anything. The shell owns nothing; each tab loads its own data so
 * switching never refetches a sibling's slice.
 */
export const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = useState<AdminTab>('overview');

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  // Tabs are keyed so switching fully remounts the panel — the rooms tab's
  // in-flight close/delete state must not survive a tab-away/tab-back.
  return (
    <div className="relative flex min-h-screen bg-bg-primary">
      <div className="theme-backdrop" aria-hidden />

      <div className="relative flex w-full flex-col lg:flex-row">
        {/* ── Sidebar (desktop) ── */}
        <aside className="hidden w-60 shrink-0 border-r border-border bg-bg-secondary/60 p-4 lg:flex lg:flex-col">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2.5 px-2 py-1.5 text-left"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg-secondary font-mono text-sm font-bold text-accent">
              {'</>'}
            </span>
            <span className="font-display text-base font-semibold text-text-primary">CodeSync</span>
          </button>

          <div className="mt-6 flex items-center gap-2 rounded-lg border border-border bg-bg-tertiary/40 px-3 py-2.5">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-danger/15 text-danger">
              <ShieldHalf size={13} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-text-primary">Admin console</p>
              <p className="truncate text-[10px] text-text-secondary">{user?.email}</p>
            </div>
          </div>

          <nav className="mt-5 flex flex-col gap-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  tab === id
                    ? 'bg-accent/12 text-accent'
                    : 'text-text-secondary hover:bg-bg-tertiary/60 hover:text-text-primary'
                )}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-2 pt-4">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              <ArrowLeft size={14} /> Back to dashboard
            </button>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleLogout}
                className="text-xs text-text-secondary transition-colors hover:text-danger"
              >
                Log out
              </button>
              <ThemeToggle />
            </div>
          </div>
        </aside>

        {/* ── Main column ── */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-bg-primary/80 px-4 backdrop-blur sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-2 text-text-primary lg:hidden"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg-secondary font-mono text-sm font-bold text-accent">
                  {'</>'}
                </span>
              </button>
              <h1 className="font-display text-lg font-semibold text-text-primary">
                {TABS.find((entry) => entry.id === tab)?.label}
              </h1>
            </div>
            <div className="flex items-center gap-2 lg:hidden">
              <ThemeToggle />
              <button
                type="button"
                onClick={handleLogout}
                className="text-sm text-text-secondary transition-colors hover:text-danger"
              >
                Log out
              </button>
            </div>
          </header>

          {/* Mobile tab strip */}
          <div className="flex gap-1 overflow-x-auto border-b border-border bg-bg-secondary/40 p-2 lg:hidden">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  tab === id ? 'bg-accent/12 text-accent' : 'text-text-secondary hover:text-text-primary'
                )}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-8 sm:px-6 sm:py-12">
            {tab === 'overview' && <AdminOverview onJumpToTab={setTab} />}
            {tab === 'rooms' && <AdminRooms onError={toast} />}
            {tab === 'users' && <AdminUsers onError={toast} currentUserId={user?.id ?? ''} />}
            {tab === 'activity' && <AdminActivity />}
          </main>
        </div>
      </div>
    </div>
  );
};
