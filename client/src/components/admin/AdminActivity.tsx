import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw, Sparkles, Pencil, Check, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { fetchAdminActivity, type AdminActivityEntry } from '../../lib/adminApi';
import { extractApiError } from '../../lib/api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { Avatar } from '../ui/Avatar';

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

const ENTRY_META: Record<
  AdminActivityEntry['type'],
  { icon: typeof Sparkles; label: string; className: string }
> = {
  human_edit: { icon: Pencil, label: 'Edit', className: 'text-accent' },
  ai_suggestion: { icon: Sparkles, label: 'AI suggestion', className: 'text-warning' },
  ai_accepted: { icon: Check, label: 'AI accepted', className: 'text-success' },
  ai_rejected: { icon: X, label: 'AI rejected', className: 'text-danger' },
};

/** Recent activity across every room, sourced from the shared edit history. */
export const AdminActivity = () => {
  const [entries, setEntries] = useState<AdminActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await fetchAdminActivity(50));
    } catch (err) {
      setError(extractApiError(err, 'Could not load activity.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Card spotlight={false} gradientBorder={false} className="p-5">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="mb-3 h-12 w-full" />
        ))}
      </Card>
    );
  }

  if (error) {
    return (
      <div className="mt-8 flex items-center gap-3 rounded-card border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        <AlertCircle size={16} className="shrink-0" />
        <span className="flex-1">{error}</span>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshCw size={14} /> Retry
        </Button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="mt-16 flex flex-col items-center text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-panel border border-border bg-bg-secondary">
          <Sparkles size={22} className="text-text-secondary" />
        </div>
        <h2 className="font-display text-xl font-semibold text-text-primary">No activity yet</h2>
        <p className="mt-2 max-w-sm text-sm text-text-secondary">
          Edits and AI suggestions across all rooms will show up here.
        </p>
      </div>
    );
  }

  return (
    <Card spotlight={false} gradientBorder={false} className="overflow-hidden p-0">
      <ul className="flex flex-col divide-y divide-border">
        {entries.map((entry, index) => {
          const meta = ENTRY_META[entry.type];
          const Icon = meta.icon;
          return (
            <motion.li
              key={entry._id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3), ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-3 px-5 py-3.5"
            >
              {entry.userId ? (
                <Avatar name={entry.userName} id={entry.userId} size="sm" />
              ) : (
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
                  <Sparkles size={13} />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text-primary">
                  <span className="font-medium">{entry.userName}</span>{' '}
                  <span className="text-text-secondary">{entry.summary.toLowerCase()}</span>
                </p>
                <p className="mt-0.5 truncate font-mono text-[10.5px] text-text-secondary">{entry.roomId}</p>
              </div>

              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-text-secondary">
                <Icon size={12} className={meta.className} />
                {meta.label}
              </span>
              <span className="w-16 shrink-0 text-right text-[11px] text-text-secondary">
                {relativeTime(entry.createdAt)}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </Card>
  );
};
