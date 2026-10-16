import { useEffect, useState } from 'react';

// Waiting time is the one number on the board that changes while nobody touches anything: it is read
// from arrivedAt, which the server owns. This returns a clock that moves once a minute so the card can
// be recomputed without refetching, and it is cleaned up so a page that leaves the board stops ticking.
export function useMinuteTick() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);

    return () => clearInterval(timer);
  }, []);

  return now;
}
