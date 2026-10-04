import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Users, Lock, Globe, ArrowRight, Search, LogOut, AlertCircle, RefreshCw, LogIn, Check, Copy } from 'lucide-react';
import { api, extractApiError } from '../lib/api';
import type { RoomDTO } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { ThemeToggle } from '../components/ThemeToggle';
import { Kbd } from '../components/ui/Kbd';
import { LanguageSelect } from '../components/room/LanguageSelect';
import { colorForUserId, initials } from '../lib/utils';
import { DEFAULT_LANGUAGE } from '../lib/languages';

/** Deterministic faux-code thumbnail so every room card has a visual. */
const thumbnailFor = (room: RoomDTO) => {
  const seed = [...room._id].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const lines = [
    'function ' + room.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) + '() {',
    '  const id = ' + (seed % 9000 + 1000) + ';',
    '  return sync.join(id);',
    '}',
  ];
  return lines.join('\n');
};

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
  return new Date(iso).toLocaleDateString();
};

export const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [rooms, setRooms] = useState<RoomDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomPublic, setNewRoomPublic] = useState(true);
  const [newRoomPassword, setNewRoomPassword] = useState('');
  const [newRoomLanguage, setNewRoomLanguage] = useState(DEFAULT_LANGUAGE);
  const [formError, setFormError] = useState('');
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  // ── Join-room dialog state ──
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  // null = unknown yet, true = public (no password needed), false = private.
  const [joinVisibility, setJoinVisibility] = useState<boolean | null>(null);
  const [checkingVisibility, setCheckingVisibility] = useState(false);
  const [joinNotFound, setJoinNotFound] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // ── Created-room confirmation (shows just the Room ID — never a link) ──
  const [createdRoom, setCreatedRoom] = useState<RoomDTO | null>(null);
  const [copiedCreatedId, setCopiedCreatedId] = useState(false);

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const response = await api.get('/rooms');
      setRooms(response.data?.rooms ?? []);
      setError('');
    } catch (err) {
      setError(extractApiError(err, 'Failed to load your rooms.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRooms();
  }, []);

  // Allow the command palette to trigger room creation (?new=1), and the room
  // page to route a non-member straight into the Join flow (?join=<roomId>).
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const joinId = search.get('join');
    if (joinId) {
      resetJoinForm();
      setJoinRoomId(joinId);
      setShowJoinForm(true);
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    if (search.get('new') === '1') {
      setShowCreateForm(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newRoomName.trim()) {
      setFormError('Give your room a name.');
      return;
    }
    if (!newRoomPublic && newRoomPassword.trim().length < 4) {
      setFormError('Private rooms need a password of at least 4 characters.');
      return;
    }
    setFormError('');
    setCreating(true);
    try {
      const response = await api.post('/rooms', {
        name: newRoomName.trim(),
        isPublic: newRoomPublic,
        language: newRoomLanguage,
        // Ignored by the server for public rooms; required for private ones.
        password: newRoomPublic ? undefined : newRoomPassword,
      });
      setShowCreateForm(false);
      setNewRoomName('');
      setNewRoomPassword('');
      setNewRoomLanguage(DEFAULT_LANGUAGE);
      // Surface the Room ID front and centre — there is no link to copy, the
      // Room ID (+ password for a private room) is how collaborators get in.
      setCreatedRoom(response.data.room);
      setCopiedCreatedId(false);
      void fetchRooms();
    } catch (err) {
      setFormError(extractApiError(err, 'Could not create the room.'));
    } finally {
      setCreating(false);
    }
  };

  const copyCreatedId = async () => {
    if (!createdRoom) return;
    try {
      await navigator.clipboard.writeText(createdRoom._id);
      setCopiedCreatedId(true);
      window.setTimeout(() => setCopiedCreatedId(false), 2000);
    } catch {
      toast({ title: 'Clipboard unavailable', variant: 'error' });
    }
  };

  const resetJoinForm = () => {
    setJoinRoomId('');
    setJoinPassword('');
    setJoinVisibility(null);
    setJoinNotFound(false);
    setJoinError('');
  };

  /**
   * Lightweight visibility probe so the dialog only asks for a password when
   * the room is actually private. A 404 is surfaced inline as "Room not found."
   * so the user learns about a bad ID immediately rather than on submit.
   */
  const checkVisibility = async (rawId: string) => {
    const id = rawId.trim();
    if (!id) {
      setJoinVisibility(null);
      setJoinNotFound(false);
      return;
    }
    setCheckingVisibility(true);
    setJoinNotFound(false);
    try {
      const { data } = await api.get(`/rooms/${encodeURIComponent(id)}/visibility`);
      setJoinVisibility(Boolean(data.isPublic));
    } catch (err) {
      if ((err as { response?: { status?: number } }).response?.status === 404) {
        setJoinNotFound(true);
        setJoinVisibility(null);
      } else {
        // Network hiccup etc.: don't block — fall back to showing the field.
        setJoinVisibility(false);
      }
    } finally {
      setCheckingVisibility(false);
    }
  };

  // Re-probe shortly after the user stops typing, so the password field
  // reflects the real room without waiting for a blur.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      void checkVisibility(joinRoomId);
    }, 350);
    return () => window.clearTimeout(handle);
    // checkVisibility is stable enough for this purpose (fresh closures per render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinRoomId]);

  const handleJoin = async (event: React.FormEvent) => {
    event.preventDefault();
    const id = joinRoomId.trim();
    if (!id) {
      setJoinError('Enter a Room ID.');
      return;
    }
    setJoinError('');
    setJoining(true);
    try {
      const { data } = await api.post(`/rooms/${encodeURIComponent(id)}/join`, {
        // Public rooms never need a password; the server ignores it anyway.
        password: joinVisibility === false ? joinPassword : undefined,
      });
      setShowJoinForm(false);
      resetJoinForm();
      toast({ title: 'Room joined', description: data.room?.name, variant: 'success' });
      navigate(`/room/${data.room._id}`);
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 404) setJoinNotFound(true);
      setJoinError(extractApiError(err, 'Could not join this room.'));
    } finally {
      setJoining(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const filtered = query.trim()
    ? rooms.filter((room) => room.name.toLowerCase().includes(query.trim().toLowerCase()))
    : rooms;

  return (
    <div className="relative flex min-h-screen bg-bg-primary">
      <div className="theme-backdrop" aria-hidden />

      <div className="relative flex w-full flex-col lg:flex-row">
        {/* ── Sidebar (desktop) ── */}
        <aside className="hidden w-60 shrink-0 border-r border-border bg-bg-secondary/60 p-4 lg:flex lg:flex-col">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2.5 px-2 py-1.5 text-text-primary"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg-primary font-mono text-sm font-bold text-accent">
              {'</>'}
            </span>
            <span className="font-display text-base font-semibold">CodeSync</span>
          </button>

          <nav className="mt-8 flex flex-col gap-1">
            <span className="px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-text-secondary">
              workspace
            </span>
            <span className="flex items-center gap-2.5 rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent">
              <Users size={15} />
              Rooms
            </span>
          </nav>

          <div className="mt-auto flex flex-col gap-3">
            <Button onClick={() => setShowCreateForm(true)} className="w-full">
              <Plus size={15} />
              New room
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                resetJoinForm();
                setShowJoinForm(true);
              }}
              className="w-full"
            >
              <LogIn size={15} />
              Join room
            </Button>
            <div className="flex items-center gap-2.5 rounded-lg border border-border p-2.5">
              <Avatar name={user?.displayName ?? 'You'} id={user?.id ?? 'me'} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{user?.displayName}</p>
                <p className="truncate text-[10px] text-text-secondary">{user?.email}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:text-text-primary"
                aria-label="Log out"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </aside>

        {/* ── Main column ── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-bg-primary/80 px-4 backdrop-blur sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              {/* Mobile brand */}
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex items-center gap-2 text-text-primary lg:hidden"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg-secondary font-mono text-sm font-bold text-accent">
                  {'</>'}
                </span>
              </button>
              <div className="relative hidden sm:block">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search rooms…"
                  aria-label="Search rooms"
                  className="h-10 w-56 rounded-control border border-border bg-bg-secondary pl-9 pr-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_20%,transparent)]"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 md:inline-flex">
                <Kbd>⌘K</Kbd>
              </span>
              <ThemeToggle />
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-bg-secondary text-text-primary lg:hidden"
                aria-label="User menu"
                aria-expanded={menuOpen}
              >
                <Avatar name={user?.displayName ?? 'You'} id={user?.id ?? 'me'} size="sm" className="ring-0" />
              </button>
            </div>
          </header>

          {/* Mobile user menu */}
          {menuOpen && (
            <div className="border-b border-border bg-bg-primary px-4 py-3 lg:hidden">
              <div className="flex items-center gap-3">
                <Avatar name={user?.displayName ?? 'You'} id={user?.id ?? 'me'} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">{user?.displayName}</p>
                  <p className="truncate text-xs text-text-secondary">{user?.email}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="ml-auto">
                  <LogOut size={15} /> Log out
                </Button>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setMenuOpen(false);
                    resetJoinForm();
                    setShowJoinForm(true);
                  }}
                >
                  <LogIn size={14} /> Join room
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowCreateForm(true);
                  }}
                >
                  <Plus size={14} /> New room
                </Button>
              </div>
            </div>
          )}

          <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-8 sm:px-6 sm:py-12">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-display text-[clamp(1.5rem,3.5vw,2.25rem)] font-bold text-text-primary">
                  Your rooms
                </h1>
                <p className="mt-1.5 text-sm text-text-secondary">
                  Pick up where you left off, {user?.displayName.split(' ')[0] ?? 'friend'}.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    resetJoinForm();
                    setShowJoinForm(true);
                  }}
                  className="sm:hidden lg:inline-flex"
                >
                  <LogIn size={16} />
                  Join room
                </Button>
                <Button onClick={() => setShowCreateForm(true)} glow className="sm:hidden lg:inline-flex">
                  <Plus size={16} />
                  New room
                </Button>
              </div>
            </div>

            {/* Error state */}
            {error && (
              <div className="mt-8 flex items-center gap-3 rounded-card border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
                <AlertCircle size={16} className="shrink-0" />
                <span className="flex-1">{error}</span>
                <Button variant="secondary" size="sm" onClick={fetchRooms}>
                  <RefreshCw size={14} /> Retry
                </Button>
              </div>
            )}

            {/* Loading skeletons */}
            {loading && (
              <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Card key={index} spotlight={false} gradientBorder={false} className="p-5">
                    <Skeleton className="mb-4 h-5 w-2/3" />
                    <Skeleton className="mb-2 h-3 w-full" />
                    <Skeleton className="mb-4 h-3 w-4/5" />
                    <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                      <Skeleton className="h-7 w-24" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && filtered.length === 0 && (
              <div className="mt-20 flex flex-col items-center text-center">
                <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-panel border border-border bg-bg-secondary">
                  <span className="caret text-3xl" aria-hidden />
                  <span className="sr-only">A blinking cursor</span>
                </div>
                <h2 className="font-display text-xl font-semibold text-text-primary">
                  {query ? 'No rooms match' : 'No rooms yet'}
                </h2>
                <p className="mt-2 max-w-sm text-sm text-text-secondary">
                  {query
                    ? `Nothing matches “${query}”. Try a different search.`
                    : 'Create a room to start collaborating — it takes one click.'}
                </p>
                <Button onClick={() => setShowCreateForm(true)} glow className="mt-6">
                  <Plus size={16} />
                  Create your first room
                </Button>
              </div>
            )}

            {/* Room grid */}
            {!loading && filtered.length > 0 && (
              <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((room, index) => {
                  const isOwner = room.ownerId === user?.id;
                  return (
                    <motion.div
                      key={room._id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: Math.min(index * 0.06, 0.36), ease: [0.22, 1, 0.36, 1] }}
                    >
                      <Card
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/room/${room._id}`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            navigate(`/room/${room._id}`);
                          }
                        }}
                        className="group flex h-full cursor-pointer flex-col p-0 transition-transform duration-200 hover:-translate-y-1"
                      >
                        {/* Code thumbnail */}
                        <div className="border-b border-border editor-surface p-3">
                          <pre className="overflow-hidden font-mono text-[10.5px] leading-relaxed text-text-secondary">
                            {thumbnailFor(room)}
                          </pre>
                        </div>

                        <div className="flex flex-1 flex-col gap-3 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-text-primary line-clamp-1">{room.name}</h3>
                            <Badge variant={room.isPublic ? 'accent' : 'default'} icon={room.isPublic ? <Globe size={11} /> : <Lock size={11} />}>
                              {room.isPublic ? 'Public' : 'Private'}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex -space-x-2">
                              {room.members.slice(0, 4).map((memberId) => (
                                <span
                                  key={memberId}
                                  style={{ backgroundColor: colorForUserId(memberId) }}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-bg-secondary"
                                >
                                  {isOwner && memberId === user?.id
                                    ? initials(user.displayName)
                                    : initials(memberId.slice(-6))}
                                </span>
                              ))}
                            </div>
                            <span className="text-xs text-text-secondary">
                              {room.members.length} member{room.members.length === 1 ? '' : 's'}
                            </span>
                          </div>

                          <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
                            <div className="flex items-center gap-2">
                              {isOwner ? (
                                <Badge variant="accent">Owner</Badge>
                              ) : (
                                <span className="text-xs text-text-secondary">Joined</span>
                              )}
                              <span className="text-xs text-text-secondary">{relativeTime(room.updatedAt)}</span>
                            </div>
                            <span className="inline-flex items-center gap-1 text-xs text-text-secondary transition-colors group-hover:text-accent">
                              Open <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                            </span>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Create room modal */}
      <Modal
        open={showCreateForm}
        onClose={() => {
          setShowCreateForm(false);
          setFormError('');
          setNewRoomPassword('');
        }}
        title="Create a room"
        description={newRoomPublic ? 'Anyone with the Room ID can join a public room.' : 'Private rooms need a password to join.'}
      >
        <form onSubmit={handleCreate} className="flex flex-col gap-4" noValidate>
          <Input
            name="roomName"
            label="Room name"
            placeholder="e.g. pair-programming-session"
            value={newRoomName}
            onChange={(event) => setNewRoomName(event.target.value)}
            error={formError}
            autoFocus
          />
          <div>
            <p className="mb-2 text-sm font-medium text-text-primary">Visibility</p>
            <SegmentedControl
              options={[
                { value: 'public', label: 'Public', icon: <Globe size={13} /> },
                { value: 'private', label: 'Private', icon: <Lock size={13} /> },
              ]}
              value={newRoomPublic ? 'public' : 'private'}
              onChange={(value) => {
                setNewRoomPublic(value === 'public');
                if (value === 'public') setNewRoomPassword('');
                setFormError('');
              }}
              className="w-full"
            />
            <p className="mt-2 text-xs text-text-secondary">
              {newRoomPublic
                ? 'Public rooms can be joined by anyone with the Room ID — no password needed.'
                : 'Private rooms are limited to you, members, and anyone you give the Room ID and password to.'}
            </p>
          </div>
          {!newRoomPublic && (
            <Input
              name="roomPassword"
              type="password"
              label="Room password"
              placeholder="At least 4 characters"
              value={newRoomPassword}
              onChange={(event) => setNewRoomPassword(event.target.value)}
              icon={<Lock size={15} />}
              autoComplete="new-password"
            />
          )}
          <div>
            <p className="mb-2 text-sm font-medium text-text-primary">Language</p>
            <LanguageSelect
              language={newRoomLanguage}
              onLanguageChange={setNewRoomLanguage}
              align="down"
              aria-label="Room language"
              triggerClassName="border border-border bg-bg-secondary px-2.5 py-2 text-sm w-full justify-between rounded-control"
            />
            <p className="mt-2 text-xs text-text-secondary">
              Empty rooms open with a short hello snippet in this language.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowCreateForm(false);
                setFormError('');
                setNewRoomPassword('');
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" loading={creating} className="flex-1">
              Create room
            </Button>
          </div>
        </form>
      </Modal>

      {/* Created-room confirmation: the Room ID is the only thing to share. */}
      <Modal
        open={Boolean(createdRoom)}
        onClose={() => setCreatedRoom(null)}
        title="Your room is ready"
        description={
          createdRoom?.isPublic
            ? 'Anyone with this Room ID can join.'
            : 'Collaborators need this Room ID and the room’s password to join.'
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-1.5 text-sm font-medium text-text-primary">Your Room ID</p>
            <div className="flex items-center gap-2 rounded-control border border-border bg-bg-primary p-3">
              <code className="flex-1 break-all font-mono text-sm text-text-primary sm:text-base">
                {createdRoom?._id}
              </code>
              <button
                type="button"
                onClick={() => void copyCreatedId()}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-bg-secondary px-2.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
              >
                {copiedCreatedId ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                {copiedCreatedId ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          {!createdRoom?.isPublic && (
            <p className="text-xs text-text-secondary">
              Share the Room ID and the password separately — anyone with both can join.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCreatedRoom(null)}
              className="flex-1"
            >
              Done
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (createdRoom) navigate(`/room/${createdRoom._id}`);
                setCreatedRoom(null);
              }}
              className="flex-1"
            >
              Open room
            </Button>
          </div>
        </div>
      </Modal>

      {/* Join room modal */}
      <Modal
        open={showJoinForm}
        onClose={() => {
          setShowJoinForm(false);
          resetJoinForm();
        }}
        title="Join a room"
        description="Enter the Room ID you were given."
      >
        <form onSubmit={handleJoin} className="flex flex-col gap-4" noValidate>
          <Input
            name="joinRoomId"
            label="Room ID"
            placeholder="Paste the Room ID"
            value={joinRoomId}
            onChange={(event) => {
              setJoinRoomId(event.target.value);
              // A new id invalidates the previous probe result.
              setJoinVisibility(null);
              setJoinNotFound(false);
              setJoinError('');
            }}
            onBlur={(event) => void checkVisibility(event.target.value)}
            error={joinNotFound ? 'Room not found.' : joinError}
            autoFocus
          />

          {joinVisibility === false && (
            <Input
              name="joinPassword"
              type="password"
              label="Room password"
              placeholder="Enter the room's password"
              value={joinPassword}
              onChange={(event) => setJoinPassword(event.target.value)}
              icon={<Lock size={15} />}
              autoComplete="current-password"
            />
          )}

          {checkingVisibility && (
            <p className="flex items-center gap-1.5 text-xs text-text-secondary">
              <RefreshCw size={12} className="animate-spin" /> Checking room…
            </p>
          )}
          {joinVisibility === true && (
            <p className="text-xs text-text-secondary">Public room — no password needed.</p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowJoinForm(false);
                resetJoinForm();
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={joining}
              disabled={checkingVisibility || !joinRoomId.trim()}
              className="flex-1"
            >
              Join room
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
