import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Copy } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { cn } from '../../lib/utils';
import { computePopoverPlacement } from '../../lib/popoverGeometry';

interface ShareButtonProps {
  roomId: string;
  /** Drives the one-line context text under the action. */
  isPublic: boolean;
  className?: string;
}

/**
 * Share affordance. There are no invite links anywhere in the app — the ONLY
 * way into a room is its Room ID (plus the room's password when it is
 * private), so the popover offers exactly one action: copy the Room ID.
 *
 * Positioning: the popover is rendered through a portal to <body> and placed
 * with `position: fixed` using the Share button's own bounding rect. Anchoring
 * it in the normal flow left it fighting the resizable AI panel's stacking
 * order, and a CSS `right-0` offset could still slide it across the panel.
 * Here the popover's right edge is clamped to the button's right edge AND to
 * the AI panel's left edge, so it drops down-and-left and can never cover the
 * panel or run off the viewport, at any window size or panel split.
 */
export const ShareButton = ({ roomId, isPublic, className }: ShareButtonProps) => {
  const { toast } = useToast();
  const reduceMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const flashCopied = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard can be unavailable (insecure context); report the failure.
      return false;
    }
  }, []);

  /** Place the popover below the button, clamped to the safe right boundary. */
  const computePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    // The AI Assistant panel occupies the right of the main area when open.
    // Its left edge is the hard limit the popover must not cross. When the
    // panel is closed the viewport edge plays that role.
    const aiPanel = document.querySelector('[data-ai-panel]');
    const panelLeft = aiPanel ? (aiPanel as HTMLElement).getBoundingClientRect().left : null;

    setCoords(computePopoverPlacement(rect, panelLeft, viewportWidth));
  }, []);

  // Recompute while open so a resize / panel drag keeps it correctly anchored.
  useEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    computePosition();
    const handle = () => computePosition();
    window.addEventListener('resize', handle);
    window.addEventListener('scroll', handle, true);
    // End of an AI-panel resize drag moves the panel's left edge.
    window.addEventListener('pointerup', handle);
    return () => {
      window.removeEventListener('resize', handle);
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('pointerup', handle);
    };
  }, [open, computePosition]);

  // Close on outside click / Escape. Both the popover (portaled to <body>) and
  // the toggle button count as "inside"; clicking either one is not an
  // outside click.
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleCopyRoomId = useCallback(async () => {
    const ok = await copyToClipboard(roomId);
    if (ok) {
      flashCopied();
      toast({ title: 'Room ID copied', variant: 'success' });
    } else {
      toast({ title: 'Clipboard unavailable', variant: 'error' });
    }
  }, [copyToClipboard, roomId, toast]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-bg-secondary px-2.5 text-xs font-medium transition-colors',
          open ? 'border-accent/50 text-text-primary' : 'text-text-secondary hover:text-text-primary',
          className
        )}
      >
        <Copy size={14} />
        <span className="hidden sm:inline">Share</span>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && coords && (
            <motion.div
              ref={popoverRef}
              role="menu"
              initial={reduceMotion ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 120 }}
              className="max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-card border border-border bg-bg-secondary shadow-lifted"
            >
              <div className="border-b border-border px-3 py-2">
                <p className="text-xs font-semibold text-text-primary">
                  {isPublic ? 'Public room' : 'Private room'}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-text-secondary">
                  {isPublic
                    ? 'Anyone with this Room ID can join.'
                    : 'Requires this Room ID and the room’s password to join.'}
                </p>
              </div>

              <div className="p-1.5">
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleCopyRoomId}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-text-primary transition-colors hover:bg-accent/10"
                >
                  {copied ? (
                    <Check size={14} className="text-success" />
                  ) : (
                    <Copy size={14} className="text-text-secondary" />
                  )}
                  <span className="flex-1 font-mono">{roomId}</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
