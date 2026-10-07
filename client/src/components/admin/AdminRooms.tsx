import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  Globe,
  Lock,
  AlertCircle,
  RefreshCw,
  Pencil,
  DoorOpen,
  Trash2,
  Users as UsersIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  fetchAdminRooms,
  fetchLiveRooms,
  patchAdminRoom,
  closeAdminRoom,
  deleteAdminRoom,
  type AdminRoom,
} from '../../lib/adminApi';
import { extractApiError } from '../../lib/api';
import { languageLabel } from '../../lib/languages';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Skeleton } from '../ui/Skeleton';
import { Tooltip } from '../ui/Tooltip';
import { useToast } from '../ui/Toast';

interface AdminRoomsProps {
  onError: (toast: { title: string; description?: string; variant: 'success' | 'info' | 'error' }) => void;
}

const FILTERS = ['all', 'public', 'private'] as const;
type VisibilityFilter = (typeof FILTERS)[number];

const relativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
};

/**
 * Room management. Deletion is deliberately two-step and occupancy-gated:
 * an occupied room cannot be deleted until "Close room" has kicked everyone
 * out and the live-occupancy refresh confirms the room is empty. The delete
 * modal itself re-checks at confirm time, so a user who rejoins between
 * closing and confirming is caught rather than dropped mid-session.
 */
export const AdminRooms = ({ onError }: AdminRoomsProps) => {
  const { toast } = useToast();
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [total, setTotal] = useState(0);
  const [occupancy, setOccupancy] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // `search` is what the input displays; `query` is the debounced value the
  // fetch reads, so a keystroke never re-runs `load` and never unmounts the
  // <input>. The visibility filter is not debounced — it changes on click.
  const [query, setQuery] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [filter, setFilter] = useState<VisibilityFilter>('all');

  const [renaming, setRenaming] = useState<AdminRoom | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState<AdminRoom | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [roomData, liveData] = await Promise.all([
        fetchAdminRooms({ search: query, filter }),
        fetchLiveRooms(),
      ]);
      setRooms(roomData.items);
      setTotal(roomData.total);
      setOccupancy(Object.fromEntries(liveData.map((room) => [room.roomId, room.occupants])));
    } catch (err) {
      setError(extractApiError(err, 'Could not load rooms.'));
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [query, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-probe occupancy only — used after a close so the delete button
  // unlocks without a full table refetch.
  const refreshOccupancy = useCallback(async () => {
    try {
      const liveData = await fetchLiveRooms();
      setOccupancy(Object.fromEntries(liveData.map((room) => [room.roomId, room.occupants])));
    } catch {
      // Non-fatal: the table still works with a stale occupancy guess.
    }
  }, []);

  const startRename = (room: AdminRoom) => {
    setRenaming(room);
    setRenameValue(room.name);
    setRenameError('');
  };

  const submitRename = async () => {
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name) {
      setRenameError('Room name cannot be empty.');
      return;
    }
    try {
      const updated = await patchAdminRoom(renaming._id, { name });
      setRooms((current) => current.map((room) => (room._id === updated._id ? updated : room)));
      toast({ title: 'Room renamed', description: name, variant: 'success' });
      setRenaming(null);
    } catch (err) {
      setRenameError(extractApiError(err, 'Could not rename the room.'));
    }
  };

  const toggleVisibility = async (room: AdminRoom) => {
    // Flipping a passwordless room private would make it unjoinable; the
    // server rejects that, so surface the reason instead of a generic error.
    if (room.isPublic && !window.confirm('Make this room private? Only members with the password can rejoin.')) {
      return;
    }
    try {
      const updated = await patchAdminRoom(room._id, { isPublic: !room.isPublic });
      setRooms((current) => current.map((entry) => (entry._id === updated._id ? updated : entry)));
      toast({
        title: 'Visibility updated',
        description: `${updated.name} is now ${updated.isPublic ? 'public' : 'private'}.`,
        variant: 'success',
      });
    } catch (err) {
      onError({ title: 'Could not change visibility', description: extractApiError(err), variant: 'error' });
    }
  };

  // ── Step one of the two-step delete: kick everyone, keep the document. ──
  const handleClose = async (room: AdminRoom) => {
    setClosing(true);
    try {
      const { kicked } = await closeAdminRoom(room._id, 'closed by an admin');
      toast({
        title: 'Room closed',
        description:
          kicked > 0
            ? `Kicked ${kicked} occupant${kicked === 1 ? '' : 's'}. The document is kept — you can now delete it.`
            : 'No one was in the room.',
        variant: 'info',
      });
      await refreshOccupancy();
    } catch (err) {
      onError({ title: 'Could not close the room', description: extractApiError(err), variant: 'error' });
    } finally {
      setClosing(false);
    }
  };

  const openDelete = async (room: AdminRoom) => {
    // Re-probe at click time: someone may have (re)joined since the table
    // rendered. The modal's confirm is gated on this fresh count.
    await refreshOccupancy();
    setDeleting(room);
  };

  // ── Step two: delete outright. Blocked while anyone is still inside. ──
  const confirmDelete = async () => {
    if (!deleting) return;
    const occupants = occupancy[deleting._id] ?? [];
    if (occupants.length > 0) {
      onError({
        title: 'Close the room first',
        description: `${occupants.length} occupant${occupants.length === 1 ? ' is' : 's are'} still editing — kick them with “Close room” before deleting.`,
        variant: 'error',
      });
      return;
    }

    setDeleteBusy(true);
    try {
      await deleteAdminRoom(deleting._id);
      setRooms((current) => current.filter((room) => room._id !== deleting._id));
      setTotal((value) => Math.max(0, value - 1));
      toast({ title: 'Room deleted', description: deleting.name, variant: 'success' });
      setDeleting(null);
    } catch (err) {
      onError({ title: 'Could not delete the room', description: extractApiError(err), variant: 'error' });
    } finally {
      setDeleteBusy(false);
    }
  };

  const deletingOccupants = useMemo(
    () => (deleting ? occupancy[deleting._id] ?? [] : []),
    [deleting, occupancy]
  );

  // The toolbar — search input included — is rendered unconditionally. An
  // early `if (loading) return <Skeleton/>` (or the error equivalent) replaced
  // the whole panel on every keystroke, unmounting the <input> and dropping
  // focus. Only the body below swaps while data is in flight.
  return (
    <div aria-busy={loading}>
      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search rooms by name…"
            aria-label="Search rooms"
            className="h-10 w-full rounded-control border border-border bg-bg-secondary pl-9 pr-3 text-sm text-text-primary placeholder:text-text-secondary/70 focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex gap-1 rounded-control border border-border bg-bg-secondary p-1">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={
                'rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ' +
                (filter === value ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:text-text-primary')
              }
            >
              {value}
            </button>
          ))}
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
      ) : rooms.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-panel border border-border bg-bg-secondary">
            <UsersIcon size={22} className="text-text-secondary" />
          </div>
          <h2 className="font-display text-xl font-semibold text-text-primary">
            {search ? 'No rooms match' : 'No rooms yet'}
          </h2>
          <p className="mt-2 max-w-sm text-sm text-text-secondary">
            {search ? `Nothing matches “${search}”. Try a different search.` : 'Rooms will appear here as people create them.'}
          </p>
        </div>
      ) : (
        <Card spotlight={false} gradientBorder={false} className="mt-6 overflow-hidden p-0">
          {/* Header row (desktop) */}
          <div className="hidden grid-cols-[1.6fr_1fr_0.8fr_0.8fr_auto] gap-4 border-b border-border bg-bg-tertiary/40 px-5 py-3 text-xs font-medium uppercase tracking-wide text-text-secondary md:grid">
            <span>Room</span>
            <span>Owner</span>
            <span>Members</span>
            <span>Updated</span>
            <span>Actions</span>
          </div>

          <ul className="flex flex-col divide-y divide-border">
            {rooms.map((room, index) => {
              const occupants = occupancy[room._id] ?? [];
              const occupied = occupants.length > 0;
              return (
                <motion.li
                  key={room._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.24), ease: [0.22, 1, 0.36, 1] }}
                  className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[1.6fr_1fr_0.8fr_0.8fr_auto] md:items-center md:gap-4"
                >
                  {/* Room */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-text-primary">{room.name}</span>
                      <Badge variant={room.isPublic ? 'accent' : 'default'} icon={room.isPublic ? <Globe size={11} /> : <Lock size={11} />}>
                        {room.isPublic ? 'Public' : 'Private'}
                      </Badge>
                      {occupied && (
                        <Badge variant="warning" icon={<AlertCircle size={11} />}>
                          {occupants.length} live
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-text-secondary">
                      {room._id} · {languageLabel(room.language)}
                    </p>
                  </div>

                  {/* Owner */}
                  <span className="truncate text-sm text-text-secondary">{room.ownerName}</span>

                  {/* Members */}
                  <span className="text-sm text-text-secondary">{room.memberCount}</span>

                  {/* Updated */}
                  <span className="text-sm text-text-secondary">{relativeTime(room.updatedAt)}</span>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Tooltip content="Rename" side="bottom">
                      <button
                        type="button"
                        onClick={() => startRename(room)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
                        aria-label={`Rename ${room.name}`}
                      >
                        <Pencil size={14} />
                      </button>
                    </Tooltip>

                    <Tooltip content={room.isPublic ? 'Make private' : 'Make public'} side="bottom">
                      <button
                        type="button"
                        onClick={() => void toggleVisibility(room)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
                        aria-label={`Toggle visibility for ${room.name}`}
                      >
                        {room.isPublic ? <Lock size={14} /> : <Globe size={14} />}
                      </button>
                    </Tooltip>

                    <Tooltip content={occupied ? 'Kick everyone (keeps the document)' : 'No one is in this room'} side="bottom">
                      <button
                        type="button"
                        onClick={() => void handleClose(room)}
                        disabled={!occupied || closing}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors enabled:hover:bg-warning/15 enabled:hover:text-warning disabled:opacity-40"
                        aria-label={`Close ${room.name}`}
                      >
                        <DoorOpen size={14} />
                      </button>
                    </Tooltip>

                    {occupied ? (
                      // Delete is intentionally unreachable while the room is
                      // occupied — the tooltip states the precondition rather
                      // than offering a destructive path.
                      <Tooltip
                        content={`Close the room first — ${occupants.length} occupant${occupants.length === 1 ? '' : 's'} inside`}
                        side="bottom"
                      >
                        <span>
                          <button
                            type="button"
                            disabled
                            className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md text-text-secondary opacity-40"
                            aria-label={`Delete ${room.name} — close it first`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </span>
                      </Tooltip>
                    ) : (
                      <Tooltip content="Delete room" side="bottom">
                        <button
                          type="button"
                          onClick={() => void openDelete(room)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-danger/15 hover:text-danger"
                          aria-label={`Delete ${room.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Rename modal */}
      <Modal
        open={Boolean(renaming)}
        onClose={() => setRenaming(null)}
        title="Rename room"
        description="Members keep access — the Room ID does not change."
      >
        <div className="flex flex-col gap-4 p-5 pt-0">
          <Input
            name="roomName"
            label="Room name"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            error={renameError}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitRename()} disabled={!renameValue.trim()}>
              Save changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation — re-checks occupancy at confirm time */}
      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this room?"
        description={
          deletingOccupants.length > 0
            ? `${deleting?.name ?? ''} still has ${deletingOccupants.length} occupant${deletingOccupants.length === 1 ? '' : 's'}. Close it first to kick them — deletion is blocked while anyone is inside.`
            : 'This permanently deletes the room and its edit history. This cannot be undone.'
        }
      >
        <div className="flex flex-col gap-4 p-5 pt-0">
          {deletingOccupants.length > 0 ? (
            <div className="flex items-center gap-2 rounded-card border border-warning/40 bg-warning/10 p-3.5 text-sm text-warning">
              <AlertCircle size={16} className="shrink-0" />
              <span>
                Occupants: <span className="font-medium">{deletingOccupants.join(', ')}</span>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-card border border-danger/40 bg-danger/10 p-3.5 text-sm text-danger">
              <AlertCircle size={16} className="shrink-0" />
              <span>
                Deleting <span className="font-medium">{deleting?.name}</span> and its edit history.
              </span>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            {deletingOccupants.length > 0 && deleting ? (
              <Button
                variant="secondary"
                loading={closing}
                onClick={() => void handleClose(deleting).then(() => void refreshOccupancy())}
              >
                <DoorOpen size={14} /> Close room first
              </Button>
            ) : null}
            <Button
              variant="danger"
              loading={deleteBusy}
              disabled={deletingOccupants.length > 0}
              onClick={() => void confirmDelete()}
            >
              <Trash2 size={14} /> Delete room
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
