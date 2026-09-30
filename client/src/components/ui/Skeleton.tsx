import { cn } from '../../lib/utils';

interface SkeletonProps {
  className?: string;
}

/** Theme-aware shimmering placeholder (loading states). */
export const Skeleton = ({ className }: SkeletonProps) => (
  <div className={cn('skeleton rounded-lg', className)} aria-hidden />
);
