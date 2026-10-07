import { useCallback, useEffect, useState } from 'react';
import { Users, Edit3, Radio, DoorOpen, ArrowRight, AlertCircle, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  fetchAdminStats,
  fetchLiveRooms,
  type AdminStats,
  type LiveRoom,
} from '../../lib/adminApi';
import { extractApiError } from '../../lib/api';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import type { AdminTab } from '../../pages/AdminDashboard';

interface AdminOverviewProps {
  onJumpToTab: (tab: AdminTab) => void;
}

/**
 * Headline numbers plus the one thing the DB cannot answer: which rooms have
 * people in them right now. Live occupancy is polled fresh on each mount
 * rather than held in a long-lived socket subscription — this page is an
 * admin glance, not a real-time seat.
 */
export const AdminOverview = ({ onJumpToTab }: AdminOverviewProps) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [live, setLive] = useState<LiveRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, liveData] = await Promise.all([fetchAdminStats(), fetchLiveRooms()]);
      setStats(statsData);
      setLive(liveData);
    } catch (err) {
      setError(extractApiError(err, 'Could not load admin stats.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis: Array<{
    label: string;
    value: number | undefined;
    icon: typeof Users;
    accent: string;
  }> = [
    { label: 'Total users', value: stats?.users, icon: Users, accent: 'text-accent' },
    { label: 'Total rooms', value: stats?.rooms, icon: DoorOpen, accent: 'text-success' },
    { label: 'Active right now', value: stats?.activeRooms, icon: Radio, accent: 'text-warning' },
    { label: 'Edits (24h)', value: stats?.editsToday, icon: Edit3, accent: 'text-danger' },
  ];

  if (loading) {
    return (
      <div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} spotlight={false} gradientBorder={false} className="p-5">
              <Skeleton className="mb-3 h-9 w-12" />
              <Skeleton className="h-3 w-20" />
            </Card>
          ))}
        </div>
        <Card spotlight={false} gradientBorder={false} className="mt-6 p-5">
          <Skeleton className="mb-4 h-5 w-40" />
          <Skeleton className="mb-3 h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </Card>
      </div>
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

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon, accent }, index) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(index * 0.06, 0.24), ease: [0.22, 1, 0.36, 1] }}
          >
            <Card spotlight={false} gradientBorder={false} className="p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                  {label}
                </span>
                <Icon size={15} className={accent} />
              </div>
              <p className="mt-3 font-display text-3xl font-bold text-text-primary">
                {value ?? 0}
              </p>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Live occupancy */}
      <Card spotlight={false} gradientBorder={false} className="mt-6 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radio size={15} className="text-warning" />
            <h2 className="text-sm font-semibold text-text-primary">Rooms with people in them</h2>
          </div>
          <span className="text-xs text-text-secondary">{live.length} live</span>
        </div>

        {live.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-secondary">
            No one is in a room right now.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {live.map((room) => (
              <li key={room.roomId} className="flex items-center gap-3 py-3">
                <Avatar name={room.name} id={room.roomId} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{room.name}</p>
                  <p className="truncate text-xs text-text-secondary">
                    {room.occupants.join(', ') || '—'}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-medium text-text-secondary">
                  {room.occupants.length} editing
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => onJumpToTab('rooms')}>
          Manage rooms <ArrowRight size={14} />
        </Button>
        <Button variant="secondary" onClick={() => onJumpToTab('users')}>
          Manage users <ArrowRight size={14} />
        </Button>
      </div>
    </div>
  );
};
