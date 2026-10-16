// The one card shell: white surface, card radius, card shadow. A card earns its border only when its
// contents are one glanceable unit, which is why it is not used as a generic wrapper everywhere.
export default function Card({ title, subtitle, action, className = '', bodyClassName = '', children }) {
  return (
    <section className={`rounded-card bg-card shadow-card ${className}`}>
      {title || action ? (
        <header className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            {title ? <h2 className="text-base font-semibold text-ink">{title}</h2> : null}
            {subtitle ? <p className="mt-1 text-sm text-ink-muted">{subtitle}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      <div className={`p-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
