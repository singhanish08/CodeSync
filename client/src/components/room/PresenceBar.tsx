import type { PresenceUser } from '../../types';
import { AvatarStack } from '../ui/Avatar';
import { cn } from '../../lib/utils';

interface PresenceBarProps {
  users: PresenceUser[];
  currentUserId?: string;
  className?: string;
}

/**
 * Presence stack. Colors are resolved client-side from the theme's cursor
 * palette — so Eye Shield never renders blue/cyan avatars even though the
 * server assigns colors from its own fixed palette.
 */
export const PresenceBar = ({ users, currentUserId, className }: PresenceBarProps) => {
  if (users.length === 0) {
    return <span className={cn('text-xs text-text-secondary', className)}>No one else here</span>;
  }

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <AvatarStack users={users} currentUserId={currentUserId} max={5} size="sm" />
      <span className="hidden whitespace-nowrap text-xs text-text-secondary md:inline">
        {users.length} in room
      </span>
    </div>
  );
};
