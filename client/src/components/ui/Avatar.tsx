import { cn, colorForUserId, initials } from '../../lib/utils';

interface AvatarProps {
  name: string;
  id: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
};

/** Circular avatar coloured from the theme's collaborator-cursor palette. */
export const Avatar = ({ name, id, size = 'md', className }: AvatarProps) => (
  <span
    title={name}
    style={{ backgroundColor: colorForUserId(id) }}
    className={cn(
      'inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white',
      'ring-2 ring-bg-primary',
      sizeClasses[size],
      className
    )}
  >
    {initials(name)}
  </span>
);

interface AvatarStackProps {
  users: Array<{ userId: string; displayName: string }>;
  currentUserId?: string;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const AvatarStack = ({ users, currentUserId, max = 5, size = 'md', className }: AvatarStackProps) => {
  const visible = users.slice(0, max);
  const overflow = users.length - visible.length;

  return (
    <div className={cn('flex items-center', className)}>
      <div className="flex -space-x-2">
        {visible.map((user) => (
          <Avatar
            key={user.userId}
            id={user.userId}
            name={user.displayName + (user.userId === currentUserId ? ' (you)' : '')}
            size={size}
            className="transition-transform duration-200 hover:translate-y-0.5 hover:z-10"
          />
        ))}
        {overflow > 0 && (
          <span
            className={cn(
              'inline-flex select-none items-center justify-center rounded-full bg-bg-secondary font-bold text-text-secondary ring-2 ring-bg-primary',
              sizeClasses[size]
            )}
          >
            +{overflow}
          </span>
        )}
      </div>
    </div>
  );
};
