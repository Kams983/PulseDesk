// A spinner is for waits where the layout is not worth predicting: a button submitting, or the session
// restore before anything is on screen. Content that has a known shape gets a skeleton instead.
export default function Spinner({ size = 20, label }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink-muted" role="status">
      <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label ? <span className="text-sm">{label}</span> : null}
      <span className="sr-only">Loading</span>
    </span>
  );
}
