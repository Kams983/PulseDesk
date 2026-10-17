import { createContext, useContext, useMemo } from 'react';
import { useSocket } from '@/hooks/useSocket';

const SocketContext = createContext(null);

// One connection for the whole app, opened as soon as there is a session and closed when it goes away.
// A page that wants live updates asks for the socket here instead of opening its own, so two pages that
// both need events still cost one connection.
export function SocketProvider({ children }) {
  const { socket, status, attempt } = useSocket();
  const value = useMemo(() => ({ socket, status, attempt }), [socket, status, attempt]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useRealtime() {
  const context = useContext(SocketContext);

  if (!context) {
    throw new Error('useRealtime must be used inside SocketProvider');
  }

  return context;
}
