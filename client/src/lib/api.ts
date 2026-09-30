import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

/**
 * The access token lives in memory only (never localStorage). Because axios
 * interceptors close over React state, we keep the token in a module-level
 * mutable holder that the AuthContext keeps in sync, avoiding stale closures.
 */
let accessToken: string | null = null;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};
export const getAccessToken = (): string | null => accessToken;

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:5175';

export const api = axios.create({
  baseURL: `${baseURL}/api`,
  withCredentials: true, // send the httpOnly refresh cookie
  timeout: 20_000,
});

// ─── Attach the bearer token to every request ────────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// ─── On 401: silently refresh once and retry the original request ────────────
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

const refreshAccessToken = async (): Promise<string | null> => {
  try {
    const response = await axios.post(
      `${baseURL}/api/auth/refresh`,
      {},
      { withCredentials: true }
    );
    const newToken: string | undefined = response.data?.accessToken;
    if (!newToken) return null;

    setAccessToken(newToken);
    // Notify the AuthContext (subscribed via this callback).
    onRefreshedListeners.forEach((listener) => listener(newToken, response.data?.user));
    return newToken;
  } catch {
    setAccessToken(null);
    onRefreshedListeners.forEach((listener) => listener(null, null));
    return null;
  }
};

type RefreshListener = (token: string | null, user: unknown) => void;
const onRefreshedListeners: Set<RefreshListener> = new Set();

/** Force a token refresh (e.g. the live socket was rejected with a stale token). */
export const forceTokenRefresh = async (): Promise<string | null> => {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshPromise = refreshAccessToken().finally(() => {
      isRefreshing = false;
    });
  }
  return refreshPromise;
};

/** Subscribe to refresh results so React state stays in sync with the holder. */
export const subscribeToRefresh = (listener: RefreshListener): (() => void) => {
  onRefreshedListeners.add(listener);
  return () => onRefreshedListeners.delete(listener);
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    // Only retry once, and only for auth failures (not e.g. a bad login).
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/signup') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      originalRequest._retry = true;

      // Coalesce concurrent 401s into a single refresh call.
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = refreshAccessToken().finally(() => {
          isRefreshing = false;
        });
      }

      const newToken = await refreshPromise;
      if (newToken && originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api.request(originalRequest as AxiosRequestConfig);
      }
    }

    return Promise.reject(error);
  }
);

/** Surfaces the server's `{ error }` message when available. */
export const extractApiError = (error: unknown, fallback = 'Something went wrong.'): string => {
  if (error instanceof AxiosError) {
    return (error.response?.data as { error?: string })?.error ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
};
