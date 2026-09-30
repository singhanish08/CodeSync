import { io, Socket } from 'socket.io-client';
import { forceTokenRefresh, getAccessToken } from './api';

/**
 * Single shared Socket.io connection. The auth token is read from the module-
 * level holder at connect time; `reconnectWithToken()` swaps the token and
 * reconnects so an active editing session survives an access-token rotation.
 */

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:5175';

// Long enough to ride out a slow cold start, short enough that a genuinely
// unreachable backend surfaces instead of spinning forever.
export const CONNECT_TIMEOUT_MS = 12_000;

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10_000,
      auth: { token: getAccessToken() },
    });
  }
  return socket;
};

export const connectSocket = (): Socket => {
  const s = getSocket();
  const token = getAccessToken();
  if (s.connected) {
    // Already connected (e.g. navigating between rooms in the same page
    // session). Reuse the live connection.
    console.info('[socket] reuse existing connection');
    return s;
  }
  console.info(`[socket] connecting to ${SOCKET_URL} (auth token present: ${Boolean(token)})`);
  s.auth = { token };
  s.connect();
  return s;
};

export const disconnectSocket = (reason = 'logout'): void => {
  const s = getSocket();
  if (s.connected) {
    console.info(`[socket] disconnecting due to: ${reason}`);
    s.disconnect();
  }
};

/**
 * Swap in a fresh token and reconnect. Called after a token refresh — the
 * socket may already be dead with a stale token, so reconnect even if it was
 * not connected when the refresh landed. A socket that is already connected
 * with this exact token is left alone: tearing it down just to re-establish
 * the same connection is what produced the observe-on-login churn.
 */
export const reconnectWithToken = (token: string): void => {
  const s = getSocket();
  const currentToken = (s.auth as { token?: string } | undefined)?.token;
  if (s.connected && currentToken === token) {
    console.info('[socket] already connected with this token — skipping reconnect');
    return;
  }
  s.auth = { token };
  console.info(`[socket] reconnecting with refreshed token (was connected: ${s.connected})`);
  s.disconnect();
  s.connect();
};

export const isSocketConnected = (): boolean => getSocket().connected;

/**
 * Recover an auth rejection: refresh the access token and reconnect with it.
 * Guards against a refresh loop when there is no valid session to refresh.
 */
let lastAuthRecovery = 0;
export const refreshAndReconnect = async (): Promise<void> => {
  const s = getSocket();
  const now = Date.now();
  if (now - lastAuthRecovery < 5_000) return; // throttled
  lastAuthRecovery = now;

  console.warn('[socket] auth rejected — refreshing token and reconnecting');
  const fresh = await forceTokenRefresh();
  if (fresh) {
    s.auth = { token: fresh };
    s.connect();
  } else {
    console.warn('[socket] no valid session to reconnect with');
  }
};
