import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import type { Socket } from 'socket.io-client';
import { base64ToUint8, uint8ToBase64, colorForUserId } from '../lib/utils';
import { starterContent } from '../lib/starterContent';

interface UseYjsDocArgs {
  roomId: string;
  userId: string;
  displayName: string;
  socket: Socket;
  language: string;
  /**
   * Held false until the REST layer confirms the caller may open the room
   * (owner/member). Joining the socket room before that would be rejected.
   */
  enabled: boolean;
}

interface UseYjsDocResult {
  doc: Y.Doc | null;
  yText: Y.Text | null;
  awareness: awarenessProtocol.Awareness | null;
  ready: boolean;
}


/**
 * Wires a local Y.Doc to the server over the shared Socket.io connection:
 *  - applies the initial `room_state` snapshot once,
 *  - applies remote `yjs_update` / `awareness_update` events (marked 'remote' so
 *    we don't echo them back),
 *  - emits local updates and local awareness changes,
 *  - binds nothing to Monaco itself — the editor component does that with y-monaco.
 */
export const useYjsDoc = ({ roomId, userId, displayName, socket, language, enabled }: UseYjsDocArgs): UseYjsDocResult => {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [yText, setYText] = useState<Y.Text | null>(null);
  const [awareness, setAwareness] = useState<awarenessProtocol.Awareness | null>(null);
  const [ready, setReady] = useState(false);

  const languageRef = useRef(language);
  languageRef.current = language;
  // Seeded once per room session. Reset in the effect below when the room
  // changes; deliberately NOT reset on a reconnect, so clearing the file
  // doesn't make the welcome snippet reappear after every token refresh.
  const seeded = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    seeded.current = false;
    setReady(false);

    const localDoc = new Y.Doc();
    const localText = localDoc.getText('content');
    const localAwareness = new awarenessProtocol.Awareness(localDoc);

    // Local cursor/selection state so remote users see us.
    localAwareness.setLocalStateField('user', {
      name: displayName,
      color: colorForUserId(userId),
    });

    // Every payload names its room so a stray broadcast from a room we have
    // already left is filtered instead of merged into this document.
    const emitUpdate = (update: Uint8Array) =>
      socket.emit('yjs_update', { roomId, update: uint8ToBase64(update) });

    // Local document changes (origin !== 'remote' means we caused them).
    localDoc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return;
      emitUpdate(update);
    });

    // Local awareness changes (cursor / selection moves).
    localAwareness.on('update', ({ added, updated }: { added: number[]; updated: number[]; removed: number[] }) => {
      const changed = added.concat(updated);
      if (changed.includes(localDoc.clientID)) {
        const encoded = awarenessProtocol.encodeAwarenessUpdate(localAwareness, [localDoc.clientID]);
        socket.emit('awareness_update', { roomId, update: uint8ToBase64(encoded) });
      }
    });

    // ── Remote → local ──────────────────────────────────────────────

    // Sync step 1 reply: the server applied our state vector and sent back
    // only what we are missing. Applying it is idempotent, so a duplicate
    // room_state is harmless.
    const onRoomState = (payload: {
      update?: string;
      stateVector?: string;
      presence?: Array<{ userId: string }>;
      language?: string;
    }) => {
      if (typeof payload?.update === 'string' && payload.update.length) {
        try {
          Y.applyUpdate(localDoc, base64ToUint8(payload.update), 'remote');
        } catch (err) {
          console.error('[useYjsDoc] Failed to apply room_state:', err);
        }
      }

      // Sync step 2: send back everything the server is missing from us,
      // computed against the state vector it just sent. On a clean join this
      // is nothing; after a reconnect it carries the edits made while
      // offline — the ones socket.io flushed ahead of join_room and that the
      // server had to queue, plus any made since. Without this the server
      // stayed behind us forever and its pendingStructs swallowed every
      // later edit.
      if (typeof payload?.stateVector === 'string') {
        try {
          const serverVector = Y.decodeStateVector(base64ToUint8(payload.stateVector));
          const myVector = Y.decodeStateVector(Y.encodeStateVector(localDoc));
          const serverIsBehind = [...myVector].some(
            ([client, clock]) => (serverVector.get(client) ?? 0) < clock
          );
          if (serverIsBehind) {
            const missing = Y.encodeStateAsUpdate(localDoc, base64ToUint8(payload.stateVector));
            socket.emit('sync_step_2', { roomId, update: uint8ToBase64(missing) });
          }
        } catch (err) {
          console.error('[useYjsDoc] Failed to send sync step 2:', err);
        }
      }

      // Seed a friendly starter only when the room is genuinely empty and we are
      // the only one present — avoids duplicated content when several people
      // join an empty room at once. `seeded` (not a per-reconnect flag) keeps
      // a cleared file from re-seeding after a reconnect.
      if (!seeded.current && !localText.toString().trim() && (payload?.presence?.length ?? 0) <= 1) {
        seeded.current = true;
        // The server ships the room's own language with this payload, so the
        // snippet matches the status bar even if our REST fetch for the room
        // metadata has not landed yet. Fall back to the prop for the case
        // where an older server omits the field.
        const seedLanguage = typeof payload?.language === 'string' && payload.language
          ? payload.language
          : languageRef.current;
        localDoc.transact(() => {
          localText.insert(0, starterContent(seedLanguage));
        });
      }

      setReady(true);
    };

    const onYjsUpdate = (payload: { roomId?: string; update?: string }) => {
      if (payload?.roomId !== roomId) return; // cross-room leak guard
      if (typeof payload.update !== 'string') return;
      try {
        Y.applyUpdate(localDoc, base64ToUint8(payload.update), 'remote');
      } catch (err) {
        console.error('[useYjsDoc] Failed to apply yjs_update:', err);
      }
    };

    const onAwarenessUpdate = (payload: { roomId?: string; update?: string }) => {
      if (payload?.roomId !== roomId) return; // cross-room leak guard
      if (typeof payload.update !== 'string') return;
      try {
        awarenessProtocol.applyAwarenessUpdate(localAwareness, base64ToUint8(payload.update), 'remote');
      } catch (err) {
        console.error('[useYjsDoc] Failed to apply awareness_update:', err);
      }
    };

    socket.on('room_state', onRoomState);
    socket.on('yjs_update', onYjsUpdate);
    socket.on('awareness_update', onAwarenessUpdate);

    // A socket that (re)connects gets a fresh socket id AND a fresh server-side
    // room membership — a join performed by a PREVIOUS connection does not
    // carry over. Emitting join_room only once on mount meant that after any
    // reconnect the new socket never entered the Socket.io room, so
    // `socket.to(roomId)` broadcasts reached nobody. Emit on every 'connect'.
    // (socket.io does not replay 'connect' to a listener attached after the
    // fact, so also fire it immediately when the socket is already up.)
    //
    // The payload carries our state vector so the server can answer with the
    // diff we are missing instead of the whole doc (sync step 1).
    const onConnect = () => {
      console.info(`[useYjsDoc] socket connected (${socket.id}) — joining room ${roomId}`);
      socket.emit('join_room', {
        roomId,
        stateVector: uint8ToBase64(Y.encodeStateVector(localDoc)),
      });
    };
    socket.on('connect', onConnect);
    if (socket.connected) onConnect();

    setDoc(localDoc);
    setYText(localText);
    setAwareness(localAwareness);

    return () => {
      // Tell the server we are leaving THIS room so it drops our membership
      // and stops routing this socket into the old room. Without it, a room
      // A → B navigation left the socket in A and A's edits leaked into B.
      socket.emit('leave_room', { roomId });
      socket.off('room_state', onRoomState);
      socket.off('yjs_update', onYjsUpdate);
      socket.off('awareness_update', onAwarenessUpdate);
      socket.off('connect', onConnect);
      localAwareness.destroy();
      localDoc.destroy();
      setDoc(null);
      setYText(null);
      setAwareness(null);
    };
  }, [roomId, userId, displayName, socket, enabled]);

  return { doc, yText, awareness, ready };
};
