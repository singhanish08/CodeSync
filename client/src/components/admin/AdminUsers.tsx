import { useCallback, useEffect, useState } from 'react';
import { Search, Shield, ShieldCheck, Trash2, AlertCircle, RefreshCw, Crown } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  fetchAdminUsers,
  patchAdminUser,
  deleteAdminUser,
  type AdminUser,
} from '../../lib/adminApi';
import { extractApiError } from '../../lib/api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Skeleton } from '../ui/Skeleton';
import { Tooltip } from '../ui/Tooltip';
import { Avatar } from '../ui/Avatar';
import { useToast } from '../ui/Toast';

interface AdminUsersProps {
  onError: (toast: { title: string; description?: string; variant: 'success' | 'info' | 'error' }) => void;
  currentUserId: string;
}

const relativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  return new Date(then).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const PAGE_SIZE = 10;

/**
 * Page buttons for the pager: every page when they all fit, otherwise the
 * first/last plus a window around the current page, with `…` gaps.
 */
const pageWindow = (current: number, count: number): Array<number | '…'> => {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index);
  const wanted = [0, current - 1, current, current + 1, count - 1].filter((page) => page >= 0 && page < count);
  const sorted = [...new Set(wanted)].sort((a, b) => a - b);
  const entries: Array<number | '…'> = [];
  let previous = -1;
  for (const page of sorted) {
    if (page - previous > 1) entries.push('…');
    entries.push(page);
    previous = page;
  }
  return entries;
};

/**
 * User management. Role changes take effect immediately server-side because
 * requireAdmin reloads the role from the DB, so a demoted admin loses panel
 * access on their very next request rather than at token expiry.
 */
export const AdminUsers = ({ onError, currentUserId }: AdminUsersProps) => {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // `search` is what the input displays; `query` is the debounced value the
  // fetch reads. Splitting them means one keystroke changes neither `load` nor
  // any of the render branches, so the <input> is never torn down mid-type.
  const [query, setQuery] = useState('');
  // 0-based; the server paginates, so `page` is part of the fetch signature.
  const [page, setPage] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Debounce the query and jump back to page 1 of the new result set. Both
  // writes happen in one tick, so React batches them into a single `load`
  // re-run — we never fetch the new query at the old page first.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search);
      setPage(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminUsers({ search: query, page, limit: PAGE_SIZE });
      setUsers(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(extractApiError(err, 'Could not load users.'));
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Deleting the last row of the last page — or a search that narrows past the
  // page we are on — would otherwise strand us on an empty page while rows are
  // still available. Step back to the last page that has data.
  useEffect(() => {
    if (!hasLoaded || users.length > 0 || total === 0 || page === 0) return;
    setPage(Math.max(0, Math.ceil(total / PAGE_SIZE) - 1));
  }, [hasLoaded, users.length, total, page]);

  const setRole = async (user: AdminUser, role: 'admin' | 'user') => {
    if (user.role === role) return;
    setBusyId(user._id);
    try {
      const updated = await patchAdminUser(user._id, role);
      setUsers((current) => current.map((entry) => (entry._id === updated._id ? updated : entry)));
      toast({
        title: role === 'admin' ? 'Promoted to admin' : 'Demoted to user',
        description: `${updated.displayName} is now ${role === 'admin' ? 'an admin' : 'a regular user'}.`,
        variant: 'success',
      });
    } catch (err) {
      onError({ title: 'Could not change role', description: extractApiError(err), variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteAdminUser(deleting._id);
      setUsers((current) => current.filter((user) => user._id !== deleting._id));
      setTotal((value) => Math.max(0, value - 1));
      toast({ title: 'User deleted', description: deleting.displayName, variant: 'success' });
      setDeleting(null);
    } catch (err) {
      onError({ title: 'Could not delete the user', description: extractApiError(err), variant: 'error' });
    } finally {
      setDeleteBusy(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, total);

  // The toolbar — search input included — is rendered unconditionally. An
  // early `if (loading) return <Skeleton/>` (or the error equivalent) replaced
  // the whole panel on every keystroke, unmounting the <input> and dropping
  // focus. Only the body below swaps while data is in flight.
  return (
    <div aria-busy={loading}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email…"
            aria-label="Search users"
            className="h-10 w-full rounded-control border border-border bg-bg-secondary pl-9 pr-3 text-sm text-text-primary placeholder:text-text-secondary/70 focus:border-accent focus:outline-none"
          />
        </div>
        <span className="text-xs text-text-secondary">{total} total</span>
      </div>

      {error ? (
        <div className="mt-8 flex items-center gap-3 rounded-card border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          <AlertCircle size={16} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCw size={14} /> Retry
          </Button>
        </div>
      ) : loading && !hasLoaded ? (
        <Card spotlight={false} gradientBorder={false} className="mt-6 p-5">
          <Skeleton className="mb-5 h-10 w-full max-w-xs" />
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="mb-3 h-14 w-full" />
          ))}
        </Card>
      ) : users.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-panel border border-border bg-bg-secondary">
            <Shield size={22} className="text-text-secondary" />
          </div>
          <h2 className="font-display text-xl font-semibold text-text-primary">
            {search ? 'No users match' : 'No users yet'}
          </h2>
          <p className="mt-2 max-w-sm text-sm text-text-secondary">
            {search ? `Nothing matches “${search}”. Try a different search.` : 'Accounts will appear here as people sign up.'}
          </p>
        </div>
      ) : (
        <>
        <Card spotlight={false} gradientBorder={false} className="mt-6 overflow-hidden p-0">
          <div className="hidden grid-cols-[1.5fr_1.4fr_0.7fr_0.7fr_auto] gap-4 border-b border-border bg-bg-tertiary/40 px-5 py-3 text-xs font-medium uppercase tracking-wide text-text-secondary md:grid">
            <span>User</span>
            <span>Email</span>
            <span>Rooms</span>
            <span>Joined</span>
            <span>Actions</span>
          </div>

          <ul className="flex flex-col divide-y divide-border">
            {users.map((user, index) => {
              const isSelf = user._id === currentUserId;
              const isAdmin = user.role === 'admin';
              return (
                <motion.li
                  key={user._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.24), ease: [0.22, 1, 0.36, 1] }}
                  className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[1.5fr_1.4fr_0.7fr_0.7fr_auto] md:items-center md:gap-4"
                >
                  {/* User */}
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={user.displayName} id={user._id} size="sm" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-text-primary">{user.displayName}</span>
                        {isSelf && (
                          <span className="shrink-0 text-[10px] font-medium text-text-secondary">(you)</span>
                        )}
                      </div>
                      {isAdmin && (
                        <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-warning">
                          <Crown size={10} /> Admin
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Email */}
                  <span className="truncate text-sm text-text-secondary">{user.email}</span>

                  {/* Rooms owned */}
                  <span className="text-sm text-text-secondary">{user.ownedRooms}</span>

                  {/* Joined */}
                  <span className="text-sm text-text-secondary">{relativeTime(user.createdAt)}</span>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isAdmin ? (
                      <Tooltip content={isSelf ? 'You cannot demote yourself' : 'Demote to user'} side="bottom">
                        <span>
                          <button
                            type="button"
                            onClick={() => void setRole(user, 'user')}
                            disabled={isSelf || busyId === user._id}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-text-secondary transition-colors enabled:hover:bg-warning/15 enabled:hover:text-warning disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <ShieldCheck size={14} /> Demote
                          </button>
                        </span>
                      </Tooltip>
                    ) : (
                      <Tooltip content="Promote to admin" side="bottom">
                        <button
                          type="button"
                          onClick={() => void setRole(user, 'admin')}
                          disabled={busyId === user._id}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-text-secondary transition-colors enabled:hover:bg-accent/15 enabled:hover:text-accent disabled:opacity-40"
                        >
                          <Shield size={14} /> Promote
                        </button>
                      </Tooltip>
                    )}

                    <Tooltip content={isSelf ? 'You cannot delete your own account' : 'Delete user and their rooms'} side="bottom">
                      <span>
                        <button
                          type="button"
                          onClick={() => setDeleting(user)}
                          disabled={isSelf}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors enabled:hover:bg-danger/15 enabled:hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Delete ${user.displayName}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </span>
                    </Tooltip>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </Card>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-text-secondary">
            Showing {rangeStart}–{rangeEnd} of {total} {total === 1 ? 'user' : 'users'}.
          </p>
          {pageCount > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                disabled={page === 0}
                className="h-8 rounded-md border border-border bg-bg-secondary px-3 text-xs font-medium text-text-secondary transition-colors enabled:hover:bg-bg-tertiary enabled:hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              {pageWindow(page, pageCount).map((entry, index) =>
                entry === '…' ? (
                  <span key={`gap-${index}`} className="px-1 text-xs text-text-secondary">
                    …
                  </span>
                ) : (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => setPage(entry)}
                    aria-label={`Page ${entry + 1}`}
                    aria-current={entry === page ? 'page' : undefined}
                    className={
                      'h-8 w-8 rounded-md text-xs font-medium transition-colors ' +
                      (entry === page
                        ? 'bg-accent/15 text-accent'
                        : 'border border-border bg-bg-secondary text-text-secondary enabled:hover:bg-bg-tertiary enabled:hover:text-text-primary')
                    }
                  >
                    {entry + 1}
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
                disabled={page >= pageCount - 1}
                className="h-8 rounded-md border border-border bg-bg-secondary px-3 text-xs font-medium text-text-secondary transition-colors enabled:hover:bg-bg-tertiary enabled:hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
        </>
      )}

      {/* Delete confirmation */}
      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this account?"
        description="This cascades: every room they own is deleted (with its occupants kicked) and they are removed from all other rooms. This cannot be undone."
      >
        <div className="flex flex-col gap-4 p-5 pt-0">
          {deleting && (
            <div className="flex items-center gap-3 rounded-card border border-danger/40 bg-danger/10 p-3.5">
              <Avatar name={deleting.displayName} id={deleting._id} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-danger">{deleting.displayName}</p>
                <p className="truncate text-xs text-danger/80">
                  {deleting.email} · {deleting.ownedRooms} owned room{deleting.ownedRooms === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleteBusy} onClick={() => void confirmDelete()}>
              <Trash2 size={14} /> Delete account
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
