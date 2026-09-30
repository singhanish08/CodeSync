import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react';
import { cn } from '../../lib/utils';

type ToastVariant = 'success' | 'info' | 'error';

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (toast: Omit<Toast, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const VARIANT_STYLES: Record<ToastVariant, { icon: typeof CheckCircle2; accent: string }> = {
  success: { icon: CheckCircle2, accent: 'text-success' },
  info: { icon: Info, accent: 'text-accent' },
  error: { icon: AlertCircle, accent: 'text-danger' },
};

let counter = 0;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    (next: Omit<Toast, 'id'>) => {
      const id = `toast-${++counter}`;
      setToasts((current) => [...current, { ...next, id }]);
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((entry) => {
          const { icon: Icon, accent } = VARIANT_STYLES[entry.variant];
          return (
            <div
              key={entry.id}
              role="status"
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border border-border p-3.5',
                'glass shadow-lifted',
                'animate-[fade-in-up_0.25s_cubic-bezier(0.22,1,0.36,1)]'
              )}
            >
              <Icon size={18} className={cn('mt-0.5 shrink-0', accent)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-primary">{entry.title}</p>
                {entry.description && (
                  <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">{entry.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(entry.id)}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:text-text-primary"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
};

/**
 * Inline hook-free helper for code that lives outside React (rare). Components
 * should prefer `useToast`.
 */
export const dismissAllToasts = () => {};
