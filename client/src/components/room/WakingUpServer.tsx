import { motion } from 'framer-motion';
import { CaretLoader } from '../ui/Spinner';

interface WakingUpServerProps {
  /** Optional extra context line under the headline. */
  note?: string;
}

/**
 * Branded full-screen loader shown while the room establishes its socket
 * connection. On free-tier hosting the backend may be cold-starting, so the
 * state is first-class rather than a bare spinner.
 */
export const WakingUpServer = ({ note }: WakingUpServerProps) => (
  <div className="relative flex h-screen flex-col items-center justify-center gap-6 bg-bg-primary px-6">
    <div className="theme-backdrop" aria-hidden />

    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-10 flex flex-col items-center gap-5"
    >
      {/* Terminal-ish window with blinking carets */}
      <div className="overflow-hidden rounded-card border border-border bg-bg-secondary shadow-lifted gradient-border">
        <div className="flex h-8 items-center gap-2 border-b border-border px-3">
          <span className="h-2 w-2 rounded-full bg-danger/70" />
          <span className="h-2 w-2 rounded-full bg-warning/70" />
          <span className="h-2 w-2 rounded-full bg-success/70" />
          <span className="ml-2 font-mono text-[10px] text-text-secondary">server.log</span>
        </div>
        <div className="editor-surface px-4 py-3">
          <p className="font-mono text-[11px] leading-relaxed text-text-secondary">
            <span className="text-success">$</span> booting codesync-server
            <br />
            <span className="text-accent">→</span> connecting socket
            <span className="caret" aria-hidden />
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2.5">
        <CaretLoader />
        <p className="text-base font-medium text-text-primary">Waking up the server…</p>
        <p className="max-w-xs text-center text-sm text-text-secondary">
          {note ?? 'This can take a few seconds if the backend has been idle.'}
        </p>
      </div>
    </motion.div>
  </div>
);
