import { useEffect } from 'react';
import { getSocket } from '../lib/socket';
import { useToast } from './ui/Toast';

/**
 * The server emits `error` when a socket request fails — a denied room join,
 * an expired AI suggestion, a failed apply. Nothing else in the client
 * listens for it, so without this bridge those failures were invisible: a
 * rejected join left the room on "Waking up the server…" forever, and a bad
 * accept_suggestion left the panel falsely showing "Applied".
 *
 * This component lives inside ToastProvider so it can raise a toast. It
 * renders nothing.
 *
 * `connect_error` is deliberately NOT handled here: it fires on every
 * reconnection attempt, so toasting it would spam during a transient drop.
 * That path is surfaced by useSocket's connection status (the connection
 * pill, and the full-screen Retry state when we never connected).
 */
export const SocketErrorListener = () => {
  const { toast } = useToast();

  useEffect(() => {
    const socket = getSocket();
    const onError = (payload: unknown) => {
      const message =
        (payload as { message?: string } | null)?.message?.trim() ??
        'Something went wrong on the server. Please try again.';
      toast({ title: 'Connection problem', description: message, variant: 'error' });
    };

    socket.on('error', onError);
    return () => {
      socket.off('error', onError);
    };
  }, [toast]);

  return null;
};
