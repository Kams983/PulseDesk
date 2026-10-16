// An empty state is a moment to explain what belongs here and what to do next, never a blank area.
export default function EmptyState({ icon: Icon, title, text, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center gap-3 rounded-card bg-page/70 px-6 py-10 text-center ${className}`}>
      {Icon ? (
        <span className="flex h-12 w-12 items-center justify-center rounded-pill bg-primary-tint text-primary">
          <Icon size={22} aria-hidden="true" />
        </span>
      ) : null}
      <div>
        <p className="font-semibold text-ink">{title}</p>
        {text ? <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">{text}</p> : null}
      </div>
      {action}
    </div>
  );
}
