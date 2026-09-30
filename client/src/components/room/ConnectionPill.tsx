import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface ConnectionPillProps {
  status: ConnectionStatus;
  className?: string;
}

const CONFIG: Record<ConnectionStatus, { label: string; dot: string; text: string; pulse: boolean }> = {
  connected: { label: 'Live', dot: 'bg-success', text: 'text-success', pulse: false },
  connecting: { label: 'Connecting', dot: 'bg-warning', text: 'text-warning', pulse: true },
  disconnected: { label: 'Offline', dot: 'bg-danger', text: 'text-danger', pulse: false },
};

/** Small status pill showing the socket state, with a live pulse while connecting. */
export const ConnectionPill = ({ status, className }: ConnectionPillProps) => {
  const config = CONFIG[status];

  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-bg-secondary px-2.5 text-[11px] font-medium',
        config.text,
        className
      )}
      role="status"
      aria-label={`Connection: ${config.label}`}
    >
      <span className="relative flex h-2 w-2">
        <AnimatePresence mode="wait">
          <motion.span
            key={status}
            className={cn('inline-block h-2 w-2 rounded-full', config.dot)}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        </AnimatePresence>
        {config.pulse && (
          <motion.span
            className={cn('absolute inset-0 rounded-full', config.dot)}
            animate={{ scale: [1, 2.2], opacity: [0.7, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
            aria-hidden
          />
        )}
      </span>
      {config.label}
    </span>
  );
};
