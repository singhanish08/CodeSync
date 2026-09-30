import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { UserDTO } from '../types';
import { api, extractApiError, getAccessToken, setAccessToken, subscribeToRefresh } from '../lib/api';
import { disconnectSocket, reconnectWithToken } from '../lib/socket';

interface AuthContextValue {
  user: UserDTO | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<string>;
  resetPassword: (token: string, newPassword: string) => Promise<string>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_LEAD_TIME_MS = 60 * 1000; // refresh ~1 minute before expiry

export const AuthProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleProactiveRefresh = useCallback((token: string) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);

    let delay = ACCESS_TOKEN_TTL_MS - REFRESH_LEAD_TIME_MS;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiresAt = (payload?.exp ?? 0) * 1000;
      delay = Math.max(expiresAt - Date.now() - REFRESH_LEAD_TIME_MS, 5_000);
    } catch {
      // If the token isn't decodable, fall back to the standard 15-minute window.
    }

    refreshTimer.current = setTimeout(async () => {
      try {
        const response = await api.post('/auth/refresh');
        const next = response.data?.accessToken;
        if (next) {
          setAccessToken(next);
          setUser(response.data?.user ?? null);
          // Reconnect the live socket with the fresh token so an active editing
          // session is never silently dropped on token rotation.
          reconnectWithToken(next);
          scheduleProactiveRefresh(next);
        }
      } catch {
        // The response interceptor handles hard failures (clears the session).
      }
    }, delay);
  }, []);

  // Boot: try to restore a session from the httpOnly refresh cookie.
  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const response = await api.post('/auth/refresh');
        if (cancelled) return;
        const token: string | undefined = response.data?.accessToken;
        if (token) {
          setAccessToken(token);
          setUser(response.data?.user ?? null);
          scheduleProactiveRefresh(token);
        }
      } catch {
        // No valid refresh cookie — user is simply logged out.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void restore();

    // Keep React state in sync when an interceptor refreshes the token.
    const unsubscribe = subscribeToRefresh((token, refreshedUser) => {
      if (cancelled) return;
      if (token) {
        if (refreshedUser) setUser(refreshedUser as UserDTO);
        reconnectWithToken(token);
        scheduleProactiveRefresh(token);
      } else {
        setUser(null);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [scheduleProactiveRefresh]);

  const login = useCallback(
    async (email: string, password: string, rememberMe: boolean) => {
      setError(null);
      try {
        const response = await api.post('/auth/login', { email, password, rememberMe });
        setAccessToken(response.data.accessToken);
        setUser(response.data.user);
        scheduleProactiveRefresh(response.data.accessToken);
      } catch (err) {
        setError(extractApiError(err, 'Login failed.'));
        throw err;
      }
    },
    [scheduleProactiveRefresh]
  );

  const signup = useCallback(
    async (email: string, password: string, displayName: string) => {
      setError(null);
      try {
        const response = await api.post('/auth/signup', { email, password, displayName });
        setAccessToken(response.data.accessToken);
        setUser(response.data.user);
        scheduleProactiveRefresh(response.data.accessToken);
      } catch (err) {
        setError(extractApiError(err, 'Signup failed.'));
        throw err;
      }
    },
    [scheduleProactiveRefresh]
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Even if the call fails, clear local state.
    } finally {
      // Drop the live socket so it doesn't linger with a now-invalid token.
      disconnectSocket();
      setAccessToken(null);
      setUser(null);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    }
  }, []);

  const forgotPassword = useCallback(async (email: string): Promise<string> => {
    setError(null);
    try {
      const response = await api.post('/auth/forgot-password', { email });
      return (response.data?.message as string) ?? 'Check your inbox.';
    } catch (err) {
      const message = extractApiError(err, 'Request failed.');
      setError(message);
      throw err;
    }
  }, []);

  const resetPassword = useCallback(async (token: string, newPassword: string): Promise<string> => {
    setError(null);
    try {
      const response = await api.post('/auth/reset-password', { token, newPassword });
      return (response.data?.message as string) ?? 'Password reset.';
    } catch (err) {
      const message = extractApiError(err, 'Reset failed.');
      setError(message);
      throw err;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{ user, loading, error, login, signup, logout, forgotPassword, resetPassword, clearError }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

// Re-exported for components that need the raw token (e.g. the socket).
// eslint-disable-next-line react-refresh/only-export-components
export { getAccessToken };
