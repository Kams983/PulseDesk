import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Reserved for decisions that must be made before continuing, such as confirming a cancel or booking a
// visit. Anything optional is better served inline, where a modal is an interruption.
export default function Modal({ open, title, onClose, children, footer }) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    previouslyFocused.current = document.activeElement;
    // focus moves into the dialog so a keyboard user is not left behind on the page underneath
    const firstField = panelRef.current?.querySelector('input, select, textarea, button');
    (firstField || panelRef.current)?.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      // and returns to whatever opened it
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 sm:items-center sm:p-6">
      {/* the backdrop is a button so a click outside closes without a keyboard trap */}
      <button type="button" aria-label="Close dialog" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative w-full max-w-lg rounded-t-panel bg-card p-5 shadow-pop sm:rounded-panel sm:p-6"
      >
        <header className="flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-pill p-1.5 text-ink-muted transition hover:bg-page hover:text-ink"
          >
            <X size={18} />
          </button>
        </header>
        <div className="mt-4">{children}</div>
        {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
