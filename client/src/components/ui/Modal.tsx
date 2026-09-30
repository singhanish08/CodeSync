import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  className?: string;
  /** Called when the backdrop is clicked. Defaults to closing. */
  onBackdropClick?: () => void;
}

export const Modal = ({ open, onClose, children, title, description, className, onBackdropClick }: ModalProps) => {
  if (!open) return null;

  const handleBackdrop = onBackdropClick ?? onClose;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : 'Dialog'}
    >
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={handleBackdrop}
        aria-hidden
      />
      <div
        className={cn(
          'relative w-full max-w-lg rounded-panel border border-border bg-bg-primary shadow-lifted',
          'glass animate-[modal-pop_0.22s_cubic-bezier(0.22,1,0.36,1)]',
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 p-5 pb-0">
          <div>
            {title && <h2 className="text-lg font-semibold text-text-primary">{title}</h2>}
            {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary"
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
};
