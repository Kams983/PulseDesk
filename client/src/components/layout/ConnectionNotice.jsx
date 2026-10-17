import { useEffect, useState } from 'react';
import { PulseMark } from '@/components/ui/PulseMark';
import { useRealtime } from '@/context/SocketContext';

// The live pill only exists on the scheduler, but a dropped connection affects every screen: a desk can
// leave the dashboard open all afternoon. This notice is the app-wide version, and it waits before it
// appears so an ordinary reconnect that takes 200ms never draws a banner at all.
const SHOW_AFTER_MS = 1600;

export default function ConnectionNotice() {
  const { status, attempt } = useRealtime();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // the first connection is not news: the app is still opening, and the socket is expected to be dialling
    if (status === 'live' || status === 'idle' || status === 'connecting') {
      setIsVisible(false);

      return undefined;
    }

    const timer = setTimeout(() => setIsVisible(true), SHOW_AFTER_MS);

    return () => clearTimeout(timer);
  }, [status]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div
        role="status"
        className="flex animate-astra-rise items-center gap-2.5 rounded-pill bg-card px-4 py-2 text-xs font-semibold text-ink shadow-pop"
      >
        <PulseMark size={14} className="text-arrived" />
        <span>Reconnecting to live updates</span>
        <span className="hidden font-normal text-ink-muted sm:inline">
          {attempt > 1 ? `Attempt ${attempt} · ` : ''}Bookings still save
        </span>
      </div>
    </div>
  );
}
