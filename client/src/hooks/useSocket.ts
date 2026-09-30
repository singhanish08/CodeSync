import { useCallback, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { CONNECT_TIMEOUT_MS, connectSocket, getSocket, refreshAndReconnect } from '../lib/socket';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseSocketResult {
  socket: Socket;
  status: ConnectionStatus;
  /** True until the very first successful connection (server may be cold-starting). */
  hasConnectedOnce: boolean;
  /** Human-readable reason for the last failure, shown next to the Retry button. */
  errorReason: string | null;
  /** Force another connection attempt (e.g. after a cold start or auth refresh). */
  retry: () => void;
}

/**
 * Owns the socket lifecycle for the app. The connection is established once and
 * reused; other components attach their own listeners to `socket`.
 */
export const useSocket = (autoConnect = true): UseSocketResult => {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false);
  const [errorReason, setErrorReason] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    let watchdog: ReturnType<typeof setTimeout> | null = null;

    const markConnected = () => {
      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = null;
      }
      setErrorReason(null);
      setStatus('connected');
      setHasConnectedOnce(true);
    };

    const onConnect = () => {
      console.info('[socket] connected — socket id', socket.id);
      markConnected();
    };
    const onDisconnect = (reason: string) => {
      console.info('[socket] disconnected:', reason);
      setStatus('disconnected');
    };
    const onConnectError = (err: Error) => {
      console.warn('[socket] connect_error:', err.message);
      // A stale/missing token is recoverable: refresh and reconnect once.
      const authFailure = err.message === 'Unauthorized' || err.message.includes('Missing access token');
      if (authFailure) void refreshAndReconnect();
      // Socket.io keeps retrying on its own; only surface an error state if we
      // have never connected, so an established session isn't flagged red by a
      // transient drop.
      setStatus((prev) => (prev === 'connected' ? prev : 'error'));
      setErrorReason(err.message);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    if (socket.connected) {
      // Reusing a live connection (navigating room → room in the same page
      // session): socket.io does NOT re-emit 'connect' for a listener attached
      // after the fact, so we have to reconcile the state ourselves. Without
      // this the room sits on "Waking up the server…" until the socket happens
      // to drop and reconnect on its own.
      console.info('[socket] already connected on mount — reconciling state');
      markConnected();
    } else if (autoConnect) {
      connectSocket();
      // Safety net: if the backend is unreachable (or cold-starting far longer
      // than expected), surface a real error with a Retry button instead of an
      // infinite spinner.
      watchdog = setTimeout(() => {
        if (!socket.connected) {
          console.warn(`[socket] no connection within ${CONNECT_TIMEOUT_MS / 1000}s — surfacing error`);
          setErrorReason('The server did not respond in time. It may be cold-starting.');
          setStatus('error');
        }
      }, CONNECT_TIMEOUT_MS);
    } else {
      setStatus('disconnected');
    }

    return () => {
      if (watchdog) clearTimeout(watchdog);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, [autoConnect]);

  const retry = useCallback(() => {
    console.info('[socket] manual retry requested');
    setErrorReason(null);
    setStatus('connecting');
    connectSocket();
  }, []);

  return { socket: getSocket(), status, hasConnectedOnce, errorReason, retry };
};
