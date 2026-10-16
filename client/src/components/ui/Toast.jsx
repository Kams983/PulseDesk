import { CheckCircle2, TriangleAlert, X } from 'lucide-react';

const VARIANTS = {
  success: { icon: CheckCircle2, tone: 'text-completed' },
  error: { icon: TriangleAlert, tone: 'text-danger' },
};

// Top right on a desk monitor, top centre on a phone where a right aligned stack would sit under the
// thumb. The stack is the only thing rendered by the toast context.
export default function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:items-end"
    >
      {toasts.map((toast) => {
        const { icon: Icon, tone } = VARIANTS[toast.variant] || VARIANTS.success;

        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card bg-card px-4 py-3 shadow-pop"
          >
            <Icon size={18} className={`mt-0.5 shrink-0 ${tone}`} aria-hidden="true" />
            <p className="flex-1 text-sm text-ink">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss"
              className="rounded-pill p-1 text-ink-muted transition hover:bg-page hover:text-ink"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
