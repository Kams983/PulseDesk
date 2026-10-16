import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '@/api/authApi';
import { refreshAccessToken, setAccessToken, setAuthHandlers } from '@/api/axiosClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // true until the one restore attempt has finished, so a protected route never flashes the login page
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // The access token is memory only, so a reload starts without one. The refresh cookie is still in
    // the browser, and this single call is what turns it back into a session.
    refreshAccessToken()
      .then((session) => setUser(session.user))
      .catch(() => {
        // no cookie, or an expired one: staying signed out is the correct outcome, not an error to show
      })
      .finally(() => setIsLoading(false));
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
    await authApi.logout();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, logout, isLoading }), [user, login, logout, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
