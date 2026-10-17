import { PulseMark } from '@/components/ui/PulseMark';

// The board is live through a socket the page cannot see, so this is the only place that says whether
// what is on screen is being kept up to date. Offline is not an error: every action still goes through
// the api, the grid simply waits for the next visit to the page to refresh.
//
// The two waiting states use the loader mark rather than a dot, because a dot that is not moving says
// "stopped" and reconnecting is the opposite of stopped.
const STATES = {
  live: { label: 'Live', tone: 'bg-completed-tint text-completed', dot: 'bg-completed' },
  connecting: { label: 'Connecting', tone: 'bg-arrived-tint text-arrived', loading: true },
  reconnecting: { label: 'Reconnecting', tone: 'bg-arrived-tint text-arrived', loading: true },
  offline: { label: 'Offline', tone: 'bg-cancelled-tint text-cancelled', dot: 'bg-cancelled' },
  idle: { label: 'Offline', tone: 'bg-cancelled-tint text-cancelled', dot: 'bg-cancelled' },
};

export default function LiveIndicator({ status, attempt = 0, className = '' }) {
  const state = STATES[status] || STATES.idle;

  return (
    <span
      role="status"
      title={titleFor(status, attempt)}
      className={`inline-flex items-center gap-2 rounded-pill px-3 py-1.5 text-xs font-semibold ${state.tone} ${className}`}
    >
      {state.loading ? (
        <PulseMark size={13} />
      ) : (
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-pill ${state.dot} ${status === 'live' ? 'animate-pulse' : ''}`}
        />
      )}
      {state.label}
    </span>
  );
}

function titleFor(status, attempt) {
  if (status === 'live') {
    return 'Bookings made anywhere show up here on their own';
  }

  if (status === 'connecting' || status === 'reconnecting') {
    const tries = attempt > 0 ? ` Attempt ${attempt}.` : '';

    return `Trying to reach the live service.${tries} Bookings still save.`;
  }

  return 'Live updates are not connected. Bookings still save.';
}
