import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL, getAccessToken } from '@/api/axiosClient';
import { useAuth } from '@/context/AuthContext';

// No URL in development: the socket is served by the same origin as the api, which Vite proxies, so the
// connection needs no second origin and no second CORS allowance. The production build points it at the
// deployed api, which is the one origin the socket server allows.
// `withCredentials` is on to match the http client, and `auth` is a callback rather than an object:
// socket.io calls it on every (re)connect attempt, so a connection that drops after the access token was
// rotated comes back with the current token instead of the one it was born with. The handshake verifies
// it exactly like the http middleware does.
export function useSocket() {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (!user) {
      // signing out has to take the live board with it, otherwise a closed session keeps receiving events
      setSocket(null);
      setStatus('idle');

      return undefined;
    }

    setStatus('connecting');

    const next = io(API_URL || undefined, {
      withCredentials: true,
      auth: (callback) => callback({ token: getAccessToken() }),
    });

    next.on('connect', () => setStatus('live'));
    next.on('disconnect', () => setStatus('offline'));
    // a refused handshake (expired token, deactivated account) is an offline board, not a broken page
    next.on('connect_error', () => setStatus('offline'));

    setSocket(next);

    return () => {
      next.removeAllListeners();
      next.disconnect();
      setSocket(null);
      setStatus('idle');
    };
  }, [user]);

  return { socket, status };
}
