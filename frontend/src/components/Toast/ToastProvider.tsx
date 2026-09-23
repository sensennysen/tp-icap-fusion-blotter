import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';

export type ToastVariant = 'info' | 'success' | 'error' | 'connection';

export interface Toast {
  id: string;
  variant: ToastVariant;
  message: string;
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (variant: ToastVariant, message: string) => void;
  dismissToast: (id: string) => void;
}

export const TOAST_DURATION_MS = 5000;
export const MAX_TOASTS = 5;

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  info: 'bg-toast-info',
  success: 'bg-toast-success',
  error: 'bg-toast-error',
  connection: 'bg-toast-connection',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // One auto-dismiss timer per visible toast, in display order (Map keeps insertion order),
  // so the first key is always the oldest toast.
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // A counter, not crypto.randomUUID(), which is undefined outside a secure context
  // (e.g. the app opened over plain HTTP on a LAN IP).
  const nextIdRef = useRef(0);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = `toast-${++nextIdRef.current}`;
      const timers = timersRef.current;
      timers.set(
        id,
        setTimeout(() => dismissToast(id), TOAST_DURATION_MS),
      );
      // Evict the oldest toasts past the cap so a reconnect flap can't flood the screen.
      while (timers.size > MAX_TOASTS) {
        const [oldestId, oldestTimer] = timers.entries().next().value!;
        clearTimeout(oldestTimer);
        timers.delete(oldestId);
      }
      setToasts((prev) => [...prev, { id, variant, message }].slice(-MAX_TOASTS));
    },
    [dismissToast],
  );

  const value = useMemo(
    () => ({ toasts, showToast, dismissToast }),
    [toasts, showToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.variant === 'error' ? 'alert' : 'status'}
            className={`${VARIANT_STYLES[toast.variant]} flex items-center gap-3 rounded-md px-4 py-2 text-sm font-medium text-white shadow-lg`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(toast.id)}
              className="flex items-center justify-center text-white/80 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
