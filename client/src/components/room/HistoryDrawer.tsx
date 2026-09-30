import { useEffect, useState } from 'react';
import { api, extractApiError } from '../../lib/api';
import type { EditHistoryDTO } from '../../types';
import { Drawer } from '../ui/Drawer';
import { Badge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';
import { Sparkles, User } from 'lucide-react';
import { cn, colorForUserId } from '../../lib/utils';

interface HistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  roomId: string;
  /** Presence list used to resolve user ids to display names. */
  presence: Array<{ userId: string; displayName: string }>;
  currentUserId?: string;
  currentUserDisplayName?: string;
}

const TYPE_META: Record<
  EditHistoryDTO['type'],
  { label: string; variant: 'accent' | 'success' | 'warning' | 'default' }
> = {
  human_edit: { label: 'Edit', variant: 'default' },
  ai_suggestion: { label: 'AI', variant: 'accent' },
  ai_accepted: { label: 'AI accepted', variant: 'success' },
  ai_rejected: { label: 'AI rejected', variant: 'warning' },
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
  return `${days}d ago`;
};

/**
 * Room activity drawer. Loads the room's edit history and renders a timeline
 * that attributes every entry to either a human or the AI — the multiplayer
 * audit trail.
 */
export const HistoryDrawer = ({
  open,
  onClose,
  roomId,
  presence,
  currentUserId,
  currentUserDisplayName,
}: HistoryDrawerProps) => {
  const [history, setHistory] = useState<EditHistoryDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !roomId) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.get(`/rooms/${roomId}/history`);
        if (!cancelled) setHistory(response.data?.history ?? []);
      } catch (err) {
        if (!cancelled) setError(extractApiError(err, 'Could not load the activity history.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, roomId]);

  const nameFor = (userId: string | null): string | null => {
    if (userId === null) return null; // the AI
    if (userId === currentUserId) return currentUserDisplayName ?? 'You';
    return presence.find((person) => person.userId === userId)?.displayName ?? null;
  };

  return (
    <Drawer open={open} onClose={onClose} title="Room activity" description="Everyone's edits, newest first.">
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-bg-secondary">
            <span className="caret" aria-hidden />
          </div>
          <p className="text-sm font-medium text-text-primary">No activity yet</p>
          <p className="max-w-xs text-sm text-text-secondary">
            Edits, AI suggestions and decisions will appear here once the room gets going.
          </p>
        </div>
      ) : (
        <ol className="relative space-y-1">
          {history.map((entry, index) => {
            const meta = TYPE_META[entry.type];
            const isAI = entry.userId === null;
            const name = nameFor(entry.userId);
            const unknown = !isAI && !name;

            return (
              <li key={entry._id} className="relative flex gap-3 pb-5">
                {/* Timeline rail */}
                {index < history.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute left-4 top-9 bottom-0 w-px bg-border"
                  />
                )}
                <span
                  className={cn(
                    'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-bg-primary',
                    isAI ? 'bg-accent/15 text-accent' : 'bg-bg-secondary text-text-secondary'
                  )}
                >
                  {isAI ? <Sparkles size={14} /> : <User size={14} />}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                    {isAI ? (
                      <span className="text-sm font-medium text-accent">CodeSync AI</span>
                    ) : unknown ? (
                      <span className="text-sm font-medium text-text-secondary">A collaborator</span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-text-primary"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: colorForUserId(entry.userId!) }}
                          aria-hidden
                        />
                        {name}
                        {entry.userId === currentUserId && (
                          <span className="text-xs font-normal text-text-secondary">(you)</span>
                        )}
                      </span>
                    )}
                    <span className="ml-auto whitespace-nowrap font-mono text-[10px] text-text-secondary">
                      {relativeTime(entry.timestamp)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-text-secondary">{entry.summary}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Drawer>
  );
};
