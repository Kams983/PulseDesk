import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '@/api/authApi';
import { setAccessToken, setAuthHandlers } from '@/api/axiosClient';

const AuthContext = createContext(null);

// Signing out is one request, but the curtain that covers it is a moment of its own: without a floor a
// local api answers in 40ms and the user sees a flash of overlay instead of a transition.
const SIGN_OUT_FLOOR_MS = 800;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // true until the startup screen has restored a session (or decided there is none), so no route flashes
  // the login page while that is still being worked out
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // The startup screen makes the one refresh call a reload needs, and hands the answer here, because the
  // screen that draws the wait is the screen that should own it. Two callers would mean two refreshes and
  // a race between them.
  const hydrate = useCallback((session) => {
    setAccessToken(session?.accessToken || null);
    setUser(session?.user || null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    setAuthHandlers({
      // a background refresh can hand back a newer user record, so state follows it
      onRefreshed: (refreshedUser) => setUser(refreshedUser),
      // the refresh cookie is gone: every screen behind the guard will redirect on its own
      onExpired: () => {
        setAccessToken(null);
        setUser(null);
      },
    });

    return () => setAuthHandlers({});
  }, []);

  const login = useCallback(async (email, password) => {
    const session = await authApi.login(email, password);

    setUser(session.user);

    return session.user;
  }, []);

  const logout = useCallback(async () => {
    setIsSigningOut(true);
    const startedAt = Date.now();

    try {
      // the cookie is what makes the session real, so the user is only signed out once the server has
      // cleared it. A failed call leaves them where they were rather than on a login page that a
      // reload would contradict.
      await authApi.logout();
      setUser(null);
    } finally {
      const remaining = SIGN_OUT_FLOOR_MS - (Date.now() - startedAt);

      if (remaining > 0) {
        await wait(remaining);
      }

      setIsSigningOut(false);
    }
  }, []);

  const value = useMemo(
    () => ({ user, login, logout, isLoading, isSigningOut, hydrate }),
    [user, login, logout, isLoading, isSigningOut, hydrate]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
