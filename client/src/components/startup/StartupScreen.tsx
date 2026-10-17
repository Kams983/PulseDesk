// How the morphing loader is used in this app: it owns the startup sequence and this file is the only
// place that knows where the answers go.
//
// The three seams the loader exposes are filled here:
//   onSession    the restored session is written into the auth context, so the refresh call happens once
//   waitForLive  resolves on the socket's connect event, which is the last stage on screen
//   onComplete   tells the shell it can show the app, with the screen it should show
//
// Only the destination matters to the router: a signed out browser lands on the login page because the
// guard sends it there, not because the loader navigates.

import { useCallback, useEffect, useRef } from 'react';
import PulseLoader from '@/components/ui/pulse/PulseLoader';
import type { Session } from '@/components/ui/pulse/startup';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/context/SocketContext';

// The client talks to the same origin: Vite proxies it in development and the deployed build points at
// the api through the same path.
const API_BASE = '/api/v1';

type StartupScreenProps = {
  onDone: (destination: 'app' | 'login') => void;
};

export default function StartupScreen({ onDone }: StartupScreenProps) {
  const { hydrate } = useAuth();
  const { status } = useRealtime();
  const statusRef = useRef(status);
  const waitingRef = useRef<(() => void)[]>([]);

  // the socket opens as soon as the session lands in the auth context, so this is the signal the loader
  // is waiting for rather than a second connection of its own
  useEffect(() => {
    statusRef.current = status;

    if (status === 'live') {
      const waiting = waitingRef.current;

      waitingRef.current = [];
      waiting.forEach((resolve) => resolve());
    }
  }, [status]);

  const waitForLive = useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (statusRef.current === 'live') {
          resolve();

          return;
        }

        waitingRef.current.push(resolve);
      }),
    []
  );

  const handleSession = useCallback(
    (session: Session | null) => {
      hydrate(session);
    },
    [hydrate]
  );

  return <PulseLoader apiBase={API_BASE} onSession={handleSession} waitForLive={waitForLive} onComplete={onDone} />;
}
