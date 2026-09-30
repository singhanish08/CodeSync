import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  className?: string;
}

/** Right-side sliding panel used for the room history and mobile menus. */
export const Drawer = ({ open, onClose, children, title, description, className }: DrawerProps) => {
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Panel'}>
          <motion.div
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-hidden
          />
          <motion.div
            className={cn(
              'absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-bg-primary shadow-lifted',
              className
            )}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border p-5 pb-0">
              <div>
                {title && <h2 className="text-lg font-semibold text-text-primary">{title}</h2>}
                {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary"
                aria-label="Close panel"
              >
                <X size={16} />
              </button>
            </div>
            <div className="scrollbar-thin flex-1 overflow-y-auto p-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
