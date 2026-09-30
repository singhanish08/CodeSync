import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import type { Socket } from 'socket.io-client';
import { base64ToUint8, uint8ToBase64, colorForUserId } from '../lib/utils';

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

const starterContent = (language: string): string => {
  switch (language) {
    case 'python':
    case 'ruby':
      return '# Welcome to CodeSync 👋\n# Everyone in this room edits the same document in real time.\n# Select code and hit "Explain" or "Review" in the AI panel.\n\n\ndef greet(name):\n    return f"Hello, {name}!"\n\n\nprint(greet("world"))\n';
    case 'typescript':
    case 'typescriptreact':
      return '// Welcome to CodeSync 👋\n// Everyone in this room edits the same document in real time.\n// Select code and hit "Explain" or "Review" in the AI panel.\n\nfunction greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet("world"));\n';
    case 'bash':
      return '# Welcome to CodeSync 👋\n# Everyone in this room edits the same document in real time.\n# Select code and hit "Explain" or "Review" in the AI panel.\n\ngreet() {\n  echo "Hello, $1!"\n}\n\ngreet "world"\n';
    case 'sql':
      return '-- Welcome to CodeSync 👋\n-- Everyone in this room edits the same document in real time.\n\nSELECT \'Hello, world!\' AS greeting;\n';
    case 'html':
      return '<!-- Welcome to CodeSync 👋 -->\n<!-- Everyone in this room edits the same document in real time. -->\n\n<!DOCTYPE html>\n<html>\n  <body>\n    <h1>Hello, world!</h1>\n  </body>\n</html>\n';
    case 'css':
      return '/* Welcome to CodeSync 👋 */\n/* Everyone in this room edits the same document in real time. */\n\n.greeting {\n  content: "Hello, world!";\n}\n';
    case 'markdown':
      return '# Welcome to CodeSync 👋\n\nEveryone in this room edits the same document in real time.\n\n> Select code and hit **Explain** or **Review** in the AI panel.\n';
    case 'json':
      return '{\n  "welcome": "CodeSync 👋",\n  "note": "Everyone in this room edits the same document in real time."\n}\n';
    case 'java':
    case 'kotlin':
    case 'csharp':
    case 'scala':
      return '// Welcome to CodeSync 👋\n// Everyone in this room edits the same document in real time.\n\npublic class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, world!");\n  }\n}\n';
    case 'go':
      return '// Welcome to CodeSync 👋\n// Everyone in this room edits the same document in real time.\n\npackage main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, world!")\n}\n';
    case 'rust':
    case 'c':
    case 'cpp':
      return '// Welcome to CodeSync 👋\n// Everyone in this room edits the same document in real time.\n\n#include <iostream>\n\nint main() {\n  std::cout << "Hello, world!" << std::endl;\n  return 0;\n}\n';
    default:
      return '// Welcome to CodeSync 👋\n// Everyone in this room edits the same document in real time.\n// Select code and hit "Explain" or "Review" in the AI panel.\n\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet("world"));\n';
  }
};

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

  const stateApplied = useRef(false);
  const languageRef = useRef(language);
  languageRef.current = language;

  useEffect(() => {
    if (!enabled) return;
    stateApplied.current = false;
    setReady(false);

    const localDoc = new Y.Doc();
    const localText = localDoc.getText('content');
    const localAwareness = new awarenessProtocol.Awareness(localDoc);

    // Local cursor/selection state so remote users see us.
    localAwareness.setLocalStateField('user', {
      name: displayName,
      color: colorForUserId(userId),
    });

    const emitUpdate = (update: Uint8Array) => socket.emit('yjs_update', { update: uint8ToBase64(update) });

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
        socket.emit('awareness_update', { update: uint8ToBase64(encoded) });
      }
    });

    // ── Remote → local ──────────────────────────────────────────────
    const onRoomState = (payload: { update?: string; presence?: Array<{ userId: string }> }) => {
      if (stateApplied.current) return;
      stateApplied.current = true;

      if (typeof payload?.update === 'string' && payload.update.length) {
        try {
          Y.applyUpdate(localDoc, base64ToUint8(payload.update), 'remote');
        } catch (err) {
          console.error('[useYjsDoc] Failed to apply room_state:', err);
        }
      }

      // Seed a friendly starter only when the room is genuinely empty and we are
      // the only one present — avoids duplicated content when several people
      // join an empty room at once.
      if (!localText.toString().trim() && (payload?.presence?.length ?? 0) <= 1) {
        localDoc.transact(() => {
          localText.insert(0, starterContent(languageRef.current));
        });
      }

      setReady(true);
    };

    const onYjsUpdate = (payload: { update?: string }) => {
      if (typeof payload?.update !== 'string') return;
      try {
        Y.applyUpdate(localDoc, base64ToUint8(payload.update), 'remote');
      } catch (err) {
        console.error('[useYjsDoc] Failed to apply yjs_update:', err);
      }
    };

    const onAwarenessUpdate = (payload: { update?: string }) => {
      if (typeof payload?.update !== 'string') return;
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
    const onConnect = () => {
      // Re-apply the authoritative server snapshot on (re)connect so we cannot
      // stay subtly behind after a dropped connection. Yjs merges it safely
      // with any local-only changes.
      stateApplied.current = false;
      console.info(`[useYjsDoc] socket connected (${socket.id}) — joining room ${roomId}`);
      socket.emit('join_room', { roomId });
    };
    socket.on('connect', onConnect);
    if (socket.connected) onConnect();

    setDoc(localDoc);
    setYText(localText);
    setAwareness(localAwareness);

    return () => {
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
