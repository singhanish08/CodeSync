import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { editor } from 'monaco-editor';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import { ArrowLeft, Globe, Lock, History, Pencil, RotateCw, Sparkles, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { api, extractApiError } from '../lib/api';
import type { AppTheme, PresenceUser, RoomDTO } from '../types';
import { useSocket } from '../hooks/useSocket';
import { useYjsDoc } from '../hooks/useYjsDoc';
import { CodeEditor } from '../components/editor/CodeEditor';
import { AIPanel } from '../components/ai/AIPanel';
import { PresenceBar } from '../components/room/PresenceBar';
import { MobileTabBar, type MobileView } from '../components/room/MobileTabBar';
import { StatusBar } from '../components/room/StatusBar';
import { ShareButton } from '../components/room/ShareButton';
import { ConnectionPill } from '../components/room/ConnectionPill';
import { HistoryDrawer } from '../components/room/HistoryDrawer';
import { WakingUpServer } from '../components/room/WakingUpServer';
import { ThemeToggle } from '../components/ThemeToggle';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Tooltip } from '../components/ui/Tooltip';
import { useToast } from '../components/ui/Toast';
import { cn } from '../lib/utils';

const AI_OPEN_KEY = 'codesync-ai-open';

/**
 * Tracks the desktop breakpoint so the room renders exactly one layout tree.
 * Crossing the boundary remounts the editor; document state lives in the Yjs
 * doc, so nothing is lost.
 */
const useIsDesktop = (): boolean => {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true
  );

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const handler = () => setIsDesktop(query.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);

  return isDesktop;
};

export const RoomEditor = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

  const { socket, status, hasConnectedOnce, errorReason, retry } = useSocket();
  // Remember the editor/AI split across visits.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'codesync-room-layout',
    onlySaveAfterUserInteractions: true,
    storage: localStorage,
  });
  const [room, setRoom] = useState<RoomDTO | null>(null);
  const [roomError, setRoomError] = useState('');
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [language, setLanguage] = useState('javascript');
  const [mobileView, setMobileView] = useState<MobileView>('editor');
  const [cursor, setCursor] = useState<{ line: number; column: number } | null>(null);
  const [aiOpen, setAiOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(AI_OPEN_KEY) !== 'false';
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    window.localStorage.setItem(AI_OPEN_KEY, String(aiOpen));
  }, [aiOpen]);

  // Fetch room metadata. This is the access gate: a 403 means the caller is
  // not the owner and has not joined the room yet. There is no link-based way
  // in — send them to the Join Room modal with the Room ID pre-filled.
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const response = await api.get(`/rooms/${roomId}`);
        if (!cancelled) {
          setRoom(response.data.room);
          // Seed the language from the room BEFORE the socket join fires, so
          // the starter snippet matches. Batched with setRoom, so the join
          // effect (gated on `room`) reads the updated value in the same
          // render cycle.
          setLanguage(response.data.room?.language ?? 'javascript');
          setRoomError('');
        }
      } catch (err) {
        if (cancelled) return;
        const status = (err as { response?: { status?: number } }).response?.status;
        const message = extractApiError(err, 'Could not open this room.');
        if (status === 403) {
          // Not a member: route them through the explicit join flow.
          navigate(`/dashboard?join=${encodeURIComponent(roomId)}`, { replace: true });
          return;
        }
        setRoomError(message);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [roomId, navigate]);

  const { yText, awareness, ready } = useYjsDoc({
    roomId: roomId ?? '',
    userId: user?.id ?? '',
    displayName: user?.displayName ?? 'Anonymous',
    socket,
    language,
    // Join the socket room only once the REST layer has confirmed access —
    // private rooms reject the socket join otherwise.
    enabled: Boolean(room) && !roomError,
  });

  // Presence list.
  useEffect(() => {
    const onPresence = (payload: { users?: PresenceUser[] }) => {
      if (payload?.users) setPresence(payload.users);
    };
    socket.on('presence_update', onPresence);
    return () => {
      socket.off('presence_update', onPresence);
    };
  }, [socket]);

  // Auth rejections are handled centrally in useSocket (refresh + reconnect).

  const handleEditorReady = useCallback((instance: editor.IStandaloneCodeEditor) => {
    editorRef.current = instance;
    const report = () => {
      const position = instance.getPosition();
      if (position) setCursor({ line: position.lineNumber, column: position.column });
    };
    report();
    instance.onDidChangeCursorPosition(report);
  }, []);

  const getFileContext = useCallback(() => yText?.toString() ?? '', [yText]);

  const getSelection = useCallback(() => {
    if (!editorRef.current) return undefined;
    const selection = editorRef.current.getSelection();
    const model = editorRef.current.getModel();
    if (!selection || !model) return undefined;
    if (selection.isEmpty()) return undefined;
    const text = model.getValueInRange(selection);
    return text || undefined;
  }, []);

  const handleLanguageChange = useCallback(
    (next: string) => {
      const previous = language;
      if (next === previous) return;
      // Switch locally right away; persist in the background so the room keeps
      // this language on the next visit. A failure rolls the selector back.
      setLanguage(next);
      if (!roomId) return;
      void api
        .patch(`/rooms/${roomId}`, { language: next })
        .catch((err: unknown) => {
          setLanguage(previous);
          toast({ title: 'Could not change the room language.', description: extractApiError(err), variant: 'error' });
        });
    },
    [language, roomId, toast]
  );

  // Re-layout the editor when returning to it on mobile (it was display:none).
  useEffect(() => {
    if (mobileView === 'editor' && editorRef.current) {
      requestAnimationFrame(() => editorRef.current?.layout());
    }
  }, [mobileView]);

  const canEditName = Boolean(room && user && room.ownerId === user.id);

  const startEditingName = () => {
    if (!canEditName || !room) return;
    setNameDraft(room.name);
    setIsEditingName(true);
  };

  const cancelEditingName = () => {
    setIsEditingName(false);
    setNameDraft(room?.name ?? '');
  };

  // Owner-only rename. Optimistic, with a revert + toast on failure.
  const saveName = useCallback(async () => {
    if (!room || !user) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === room.name) {
      cancelEditingName();
      return;
    }

    const previous = room.name;
    setRoom({ ...room, name: trimmed });
    try {
      await api.put(`/rooms/${room._id}`, { name: trimmed });
      toast({ title: 'Room renamed', variant: 'success' });
    } catch (err) {
      setRoom({ ...room, name: previous });
      toast({
        title: 'Could not rename the room',
        description: extractApiError(err, 'Only the owner can rename this room.'),
        variant: 'error',
      });
    } finally {
      cancelEditingName();
    }
  }, [room, user, nameDraft, toast]);

  const connectionStatus = status === 'connected' ? 'connected' : status === 'connecting' ? 'connecting' : 'disconnected';

  // ── Loading state: the server may be cold-starting on a free tier ──
  if (!hasConnectedOnce && status === 'error') {
    return (
      <div className="relative flex h-screen flex-col items-center justify-center gap-4 bg-bg-primary px-6 text-center">
        <div className="theme-backdrop" aria-hidden />
        <div className="relative z-10 flex max-w-sm flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-warning/40 bg-warning/10">
            <X size={24} className="text-warning" />
          </div>
          <p className="text-lg font-medium text-text-primary">Couldn't reach the server</p>
          <p className="text-sm text-text-secondary">
            {errorReason ?? 'The connection timed out. The server may be cold-starting — give it a moment and retry.'}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
            >
              <RotateCw size={14} /> Retry connection
            </button>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!hasConnectedOnce && status !== 'disconnected') {
    return <WakingUpServer />;
  }

  if (roomError || (!room && !hasConnectedOnce)) {
    return (
      <div className="relative flex h-screen flex-col items-center justify-center gap-4 bg-bg-primary px-6 text-center">
        <div className="theme-backdrop" aria-hidden />
        <div className="relative z-10 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-danger/40 bg-danger/10">
            <X size={24} className="text-danger" />
          </div>
          <p className="text-lg font-medium text-text-primary">{roomError || 'Connecting…'}</p>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="text-sm font-medium text-accent transition-opacity hover:opacity-80"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  const aiPanel = (
    <AIPanel
      socket={socket}
      roomId={roomId ?? ''}
      language={language}
      getFileContext={getFileContext}
      getSelection={getSelection}
    />
  );

  const editorPane = ready && yText ? (
    <CodeEditor yText={yText} awareness={awareness} language={language} onReady={handleEditorReady} />
  ) : (
    <div className="flex h-full items-center justify-center bg-bg-primary text-text-secondary">
      <span className="caret" aria-hidden />
    </div>
  );

  const presenceList = (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">People in this room</h2>
        <p className="mt-0.5 text-sm text-text-secondary">Everyone here is editing live.</p>
      </div>
      {presence.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-bg-secondary">
            <span className="caret" aria-hidden />
          </div>
          <p className="text-sm font-medium text-text-primary">You're alone here</p>
          <p className="max-w-xs text-sm text-text-secondary">
            Share the Room ID with a collaborator to start editing together.
          </p>
          <ShareButton roomId={roomId ?? ''} isPublic={room?.isPublic ?? true} />
        </div>
      ) : (
        <ul className="space-y-2">
          {presence.map((person) => (
            <li
              key={person.userId}
              className="flex items-center gap-3 rounded-card border border-border bg-bg-secondary p-3"
            >
              <Avatar id={person.userId} name={person.displayName} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">
                  {person.displayName}
                  {person.userId === user?.id ? ' (you)' : ''}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" /> Editing live
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-bg-primary">
      {/* ── Top bar ── */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-bg-primary px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary"
            aria-label="Leave room"
          >
            <ArrowLeft size={18} />
          </button>

          {isEditingName ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveName();
              }}
              className="min-w-0"
            >
              <input
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={cancelEditingName}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') cancelEditingName();
                }}
                onFocus={(event) => event.target.select()}
                maxLength={80}
                spellCheck={false}
                className="w-40 rounded-lg border border-accent bg-bg-secondary px-2 py-1 text-sm font-semibold text-text-primary focus:outline-none sm:w-56"
                aria-label="Room name"
                autoFocus
              />
            </form>
          ) : canEditName ? (
            <Tooltip content="Click to rename" side="bottom">
              <button
                type="button"
                onClick={startEditingName}
                className="group flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-0.5 transition-colors hover:bg-bg-secondary"
              >
                <h1 className="truncate text-sm font-semibold text-text-primary sm:text-base">
                  {room?.name ?? 'Room'}
                </h1>
                <Pencil
                  size={12}
                  className="shrink-0 text-text-secondary opacity-0 transition-opacity group-hover:opacity-100"
                />
              </button>
            </Tooltip>
          ) : (
            <div className="flex min-w-0 items-center gap-1.5 px-1.5 py-0.5">
              <h1 className="truncate text-sm font-semibold text-text-primary sm:text-base">
                {room?.name ?? 'Room'}
              </h1>
            </div>
          )}

          <Badge
            variant="default"
            icon={room?.isPublic ? <Globe size={11} /> : <Lock size={11} />}
            className="hidden shrink-0 sm:inline-flex"
          >
            {room?.isPublic ? 'Public' : 'Private'}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <PresenceBar users={presence} currentUserId={user?.id} />
          </div>

          <ShareButton roomId={roomId ?? ''} isPublic={room?.isPublic ?? true} />

          <Tooltip content="Room activity" side="bottom">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary"
              aria-label="Room activity"
            >
              <History size={16} />
            </button>
          </Tooltip>

          <div className="hidden sm:block">
            <ConnectionPill status={connectionStatus} />
          </div>

          <Tooltip content={aiOpen ? 'Hide AI panel' : 'Show AI panel'} side="bottom">
            <button
              type="button"
              onClick={() => setAiOpen((open) => !open)}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                aiOpen
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
              )}
              aria-pressed={aiOpen}
              aria-label="Toggle AI panel"
            >
              <Sparkles size={16} />
            </button>
          </Tooltip>

          <ThemeToggle compact />
        </div>
      </header>

      {/* ── Main ── */}
      {isDesktop ? (
        <main className="flex min-h-0 flex-1">
          {aiOpen ? (
            <Group
              orientation="horizontal"
              className="h-full"
              defaultLayout={defaultLayout}
              onLayoutChanged={onLayoutChanged}
            >
              <Panel id="editor" defaultSize="62" minSize="38" className="min-w-0">
                {editorPane}
              </Panel>
              <Separator
                className="relative w-px shrink-0 bg-border transition-colors duration-200 hover:bg-accent/60"
                aria-label="Resize AI panel"
              >
                <span aria-hidden className="absolute inset-y-0 -left-2 -right-2" />
              </Separator>
              <Panel id="ai" defaultSize="38" minSize="26" maxSize="52" className="min-w-0">
                {aiPanel}
              </Panel>
            </Group>
          ) : (
            <div className="min-w-0 flex-1">{editorPane}</div>
          )}
        </main>
      ) : (
        <main className="relative min-h-0 flex-1">
          <div className={cn('h-full', mobileView === 'editor' ? 'block' : 'hidden')}>{editorPane}</div>
          {mobileView === 'ai' && <div className="h-full">{aiPanel}</div>}
          {mobileView === 'presence' && presenceList}
        </main>
      )}

      {isDesktop ? (
        <StatusBar
          language={language}
          cursor={cursor}
          presenceCount={presence.length}
          connected={connectionStatus === 'connected'}
          theme={theme as AppTheme}
          onLanguageChange={handleLanguageChange}
        />
      ) : (
        <MobileTabBar active={mobileView} onChange={setMobileView} aiBadge={0} />
      )}

      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        roomId={roomId ?? ''}
        presence={presence}
        currentUserId={user?.id}
        currentUserDisplayName={user?.displayName}
      />
    </div>
  );
};
