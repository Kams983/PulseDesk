// The board is live through a socket the page cannot see, so this is the only place that says whether
// what is on screen is being kept up to date. Offline is not an error: every action still goes through
// the api, the grid simply waits for the next visit to the page to refresh.
const STATES = {
  live: { label: 'Live', dot: 'bg-completed', text: 'text-completed', tone: 'bg-completed-tint' },
  connecting: { label: 'Connecting', dot: 'bg-arrived', text: 'text-arrived', tone: 'bg-arrived-tint' },
  offline: { label: 'Offline', dot: 'bg-cancelled', text: 'text-cancelled', tone: 'bg-cancelled-tint' },
  idle: { label: 'Offline', dot: 'bg-cancelled', text: 'text-cancelled', tone: 'bg-cancelled-tint' },
};

export default function LiveIndicator({ status, className = '' }) {
  const state = STATES[status] || STATES.idle;

  return (
    <span
      role="status"
      title={status === 'live' ? 'Bookings made anywhere show up here on their own' : 'Live updates are not connected'}
      className={`inline-flex items-center gap-2 rounded-pill px-3 py-1.5 text-xs font-semibold ${state.tone} ${state.text} ${className}`}
    >
      <span className={`h-2 w-2 rounded-pill ${state.dot} ${status === 'live' ? 'animate-pulse' : ''}`} aria-hidden="true" />
      {state.label}
    </span>
  );
}
