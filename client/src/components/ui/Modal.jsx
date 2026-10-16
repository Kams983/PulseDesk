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
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ink/30 p-0 sm:items-center sm:p-6">
      {/* the backdrop is a button so a click outside closes without a keyboard trap */}
      <button type="button" aria-label="Close dialog" className="absolute inset-0 cursor-default" onClick={onClose} />
      {/* Capped at the viewport and split into a fixed header, a scrolling body and a fixed footer. The
          week editor is far taller than a laptop screen, and a centred flex panel that simply overflows
          puts its own title above the window and its Save button below it, out of reach of both a mouse
          and a scrollbar: the page behind is locked, so nothing on it can scroll into view. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative flex max-h-[calc(100dvh-0.5rem)] w-full max-w-lg flex-col rounded-t-panel bg-card shadow-pop sm:max-h-[calc(100dvh-3rem)] sm:rounded-panel"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
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
        {/* min-h-0 is what lets this box shrink instead of pushing the footer out of the panel */}
        <div className={`mt-4 min-h-0 flex-1 overflow-y-auto px-5 sm:px-6 ${footer ? '' : 'pb-5 sm:pb-6'}`}>{children}</div>
        {footer ? <div className="flex shrink-0 justify-end gap-2 px-5 py-4 sm:px-6 sm:py-6">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
