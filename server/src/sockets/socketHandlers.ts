import crypto from 'crypto';
import { Server, Socket, DisconnectReason } from 'socket.io';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { Room } from '../models/Room';
import { EditHistory } from '../models/EditHistory';
import { verifyAccessToken } from '../utils/jwt';
import {
  generateStreamingReview,
  generateRefactorJSON,
  type AiMode,
  type AiChange,
} from '../services/groqService';
import { buildCodeContext } from '../services/treeSitterService';

// ─────────────────────────────── Types ─────────────────────────────────────

interface PresenceUser {
  userId: string;
  displayName: string;
  color: string;
}

interface PendingSuggestion {
  suggestionId: string;
  changes: AiChange[];
  userId: string;
  mode: AiMode;
}

interface RoomState {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  clients: Map<string, PresenceUser>; // socketId -> presence
  pendingSuggestions: Map<string, PendingSuggestion>;
  saveTimer: NodeJS.Timeout | null;
  lastHumanEditLog: number;
}

// ───────────────────────────── In-memory rooms ─────────────────────────────

const rooms = new Map<string, RoomState>();
const PERSIST_INTERVAL_MS = 30_000;
const HUMAN_EDIT_LOG_THROTTLE_MS = 3_000;

const PALETTE = [
  '#f87171', '#fb923c', '#facc15', '#4ade80', '#34d399',
  '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6', '#c084fc',
];

const colorFor = (userId: string): string =>
  PALETTE[[...userId].reduce((acc, char) => acc + char.charCodeAt(0), 0) % PALETTE.length];

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
const fromBase64 = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'base64'));

// ─────────────────────────── Room lifecycle / persistence ──────────────────

/**
 * Coerces a stored `yjsDocState` to real bytes. A hydrated Mongoose read hands
 * back a Node Buffer, but a `lean()` read returns a raw BSON Binary whose
 * `length` is a function — `new Uint8Array(binary)` then silently yields a
 * ZERO-length array, and every `Y.applyUpdate` fails with "Unexpected end of
 * array". Always normalise before decoding.
 */
const yjsStateToUint8 = (value: unknown): Uint8Array | null => {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  const maybeBinary = value as { _bsontype?: string; buffer?: unknown };
  if (maybeBinary._bsontype === 'Binary' && maybeBinary.buffer) {
    return new Uint8Array(Buffer.from(maybeBinary.buffer as ArrayBuffer));
  }
  if (value instanceof Uint8Array) return value;
  return null;
};

const persistRoom = async (roomId: string, state: RoomState): Promise<void> => {
  try {
    const update = Y.encodeStateAsUpdate(state.doc);
    await Room.updateOne({ _id: roomId }, { $set: { yjsDocState: Buffer.from(update) } });
  } catch (err) {
    console.error(`[socket] Failed to persist Yjs state for room ${roomId}:`, err);
  }
};

const getOrCreateRoomState = async (roomId: string): Promise<RoomState> => {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  const doc = new Y.Doc();
  doc.getText('content'); // ensure the shared text exists
  const awareness = new awarenessProtocol.Awareness(doc);

  const state: RoomState = {
    doc,
    awareness,
    clients: new Map(),
    pendingSuggestions: new Map(),
    saveTimer: null,
    lastHumanEditLog: 0,
  };

  // Restore the persisted snapshot so content survives server restarts.
  try {
    const room = await Room.findById(roomId).lean();
    const persisted = yjsStateToUint8(room?.yjsDocState);
    if (persisted && persisted.length) {
      Y.applyUpdate(doc, persisted);
      console.log(`[socket] Restored ${persisted.length}b of persisted state for room ${roomId}`);
    }
  } catch (err) {
    console.warn(`[socket] Could not restore persisted state for room ${roomId}:`, err);
  }

  state.saveTimer = setInterval(() => {
    void persistRoom(roomId, state);
  }, PERSIST_INTERVAL_MS);

  rooms.set(roomId, state);
  return state;
};

const removeClientFromRoom = async (socket: Socket, state: RoomState, roomId: string): Promise<void> => {
  state.clients.delete(socket.id);
  socket.leave(roomId);

  if (state.clients.size === 0) {
    if (state.saveTimer) clearInterval(state.saveTimer);
    await persistRoom(roomId, state);
    rooms.delete(roomId);
  } else {
    socket.to(roomId).emit('presence_update', { users: Array.from(state.clients.values()) });
  }
};

// ───────────────────────── AI suggestion application ───────────────────────

/**
 * Converts a 1-based inclusive line range into string offsets, so the AI's
 * suggestion can be applied to the shared Y.Text as a proper CRDT transaction
 * that merges safely with concurrent human edits.
 */
const lineRangeToOffsets = (text: string, startLine: number, endLine: number) => {
  const lines = text.split('\n');
  const sLine = Math.min(Math.max(1, Math.floor(startLine)), lines.length);
  const eLine = Math.min(Math.max(sLine, Math.floor(endLine)), lines.length);

  let startOffset = 0;
  for (let i = 0; i < sLine - 1; i++) startOffset += lines[i].length + 1; // +1 for the newline

  let endOffset = startOffset;
  for (let i = sLine - 1; i < eLine; i++) {
    endOffset += lines[i].length;
    if (i < eLine - 1) endOffset += 1;
  }

  return { startOffset, endOffset };
};

const applySuggestionToDoc = (state: RoomState, changes: AiChange[], origin: unknown): void => {
  state.doc.transact(() => {
    const ytext = state.doc.getText('content');
    // Apply bottom-up so earlier line offsets remain valid as we edit.
    const sorted = [...changes].sort((a, b) => b.startLine - a.startLine);
    for (const change of sorted) {
      const text = ytext.toString();
      const { startOffset, endOffset } = lineRangeToOffsets(text, change.startLine, change.endLine);
      const removeLength = Math.max(0, endOffset - startOffset);
      if (removeLength > 0) ytext.delete(startOffset, removeLength);
      if (change.replacement.length) ytext.insert(startOffset, change.replacement);
    }
  }, origin);
};

// ────────────────────────────── Edit logging ───────────────────────────────

const logEdit = (roomId: string, userId: string | null, type: 'human_edit' | 'ai_accepted' | 'ai_rejected' | 'ai_suggestion', summary: string): void => {
  EditHistory.create({ roomId, userId, type, summary }).catch((err) =>
    console.error(`[socket] Failed to write EditHistory (${type}) for room ${roomId}:`, err)
  );
};

const logHumanEditThrottled = (roomId: string, state: RoomState, userId: string): void => {
  const now = Date.now();
  if (now - state.lastHumanEditLog < HUMAN_EDIT_LOG_THROTTLE_MS) return;
  state.lastHumanEditLog = now;
  logEdit(roomId, userId, 'human_edit', 'Edited the shared document');
};

// ───────────────────────────── Auth middleware ─────────────────────────────

export const registerSocketHandlers = (io: Server): void => {
  // Verify the access token passed in socket.handshake.auth.token.
  io.use((socket: Socket, next) => {
    try {
      const token = (socket.handshake.auth?.token as string | undefined)?.trim();
      if (!token) throw new Error('Missing access token');

      const decoded = verifyAccessToken(token);
      socket.data.user = {
        id: decoded.userId,
        tokenVersion: decoded.tokenVersion,
        displayName: decoded.displayName,
      };
      next();
    } catch (err) {
      console.warn('[socket] Rejected connection:', err instanceof Error ? err.message : String(err));
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as { id: string; tokenVersion: number; displayName: string };
    console.info(`[socket] ${user.displayName} connected (${socket.id})`);

    // ─────────────────────────── join_room ─────────────────────────────
    socket.on('join_room', async (payload: unknown) => {
      // First thing, before any logic: this log is the ground truth that a
      // given socket actually attempted to join, and with which room id.
      const { roomId } = (payload ?? {}) as { roomId?: string };
      console.log(`[server] join_room received from socket ${socket.id} for room ${roomId ?? '(missing)'}`);

      try {
        if (!roomId || typeof roomId !== 'string') {
          socket.emit('error', { message: 'Invalid room id.' });
          return;
        }

        const room = await Room.findById(roomId).lean();
        if (!room) {
          console.warn(`[server] socket ${socket.id} — room ${roomId} not found`);
          socket.emit('error', { message: 'Room not found.' });
          return;
        }

        // The socket room is membership-gated too — knowing a Room ID is not
        // enough on its own; the caller must have joined through the REST
        // join endpoint (Room ID, plus the password for a private room).
        const alreadyMember =
          room.ownerId.toString() === user.id ||
          room.members.some((member) => member.toString() === user.id);

        if (!alreadyMember) {
          console.warn(`[server] socket ${socket.id} denied room ${roomId} — not a member`);
          socket.emit('error', { message: 'You need to join this room first.' });
          return;
        }

        const state = await getOrCreateRoomState(roomId);
        socket.join(roomId);
        // Confirms the Socket.io room membership actually happened — without
        // this, `socket.to(roomId)` broadcasts silently reach nobody.
        console.log(`[server] socket ${socket.id} joined Socket.io room ${roomId}`);
        socket.data.roomId = roomId;
        state.clients.set(socket.id, {
          userId: user.id,
          displayName: user.displayName,
          color: colorFor(user.id),
        });

        socket.emit('room_state', {
          update: toBase64(Y.encodeStateAsUpdate(state.doc)),
          presence: Array.from(state.clients.values()),
        });
        io.to(roomId).emit('presence_update', { users: Array.from(state.clients.values()) });
      } catch (err) {
        console.error('[socket] join_room failed:', err);
        socket.emit('error', { message: 'Failed to join the room.' });
      }
    });

    // ─────────────────────────── yjs_update ────────────────────────────
    socket.on('yjs_update', (payload: unknown) => {
      try {
        const roomId = socket.data.roomId as string | undefined;
        const { update } = (payload ?? {}) as { update?: string };
        if (!roomId || typeof update !== 'string') return;

        const state = rooms.get(roomId);
        if (!state) {
          console.warn(`[server] yjs_update from socket ${socket.id} — room ${roomId} has no live state`);
          return;
        }

        console.log(`[server] yjs_update received from socket ${socket.id} for room ${roomId}`);
        Y.applyUpdate(state.doc, fromBase64(update), socket);
        socket.to(roomId).emit('yjs_update', { update });
        const others = Math.max(0, state.clients.size - 1);
        console.log(`[server] broadcast yjs_update to room ${roomId} (${others} other client(s))`);
        logHumanEditThrottled(roomId, state, user.id);
      } catch (err) {
        console.error('[socket] yjs_update failed:', err);
      }
    });

    // ──────────────────────── awareness_update ────────────────────────
    socket.on('awareness_update', (payload: unknown) => {
      try {
        const roomId = socket.data.roomId as string | undefined;
        const { update } = (payload ?? {}) as { update?: string };
        if (!roomId || typeof update !== 'string') return;

        const state = rooms.get(roomId);
        if (!state) return;

        awarenessProtocol.applyAwarenessUpdate(state.awareness, fromBase64(update), socket);
        socket.to(roomId).emit('awareness_update', { update });
      } catch (err) {
        console.error('[socket] awareness_update failed:', err);
      }
    });

    // ─────────────────────────── summon_ai ─────────────────────────────
    socket.on('summon_ai', async (payload: unknown) => {
      const roomId = socket.data.roomId as string | undefined;
      if (!roomId || !rooms.has(roomId)) {
        socket.emit('ai_error', { message: 'Join a room before summoning the AI.' });
        return;
      }

      const { mode, selectedCode, fullFileContext, language } = (payload ?? {}) as {
        mode?: AiMode;
        selectedCode?: string;
        fullFileContext?: string;
        language?: string;
      };

      if (mode !== 'explain' && mode !== 'review' && mode !== 'refactor') {
        socket.emit('ai_error', { message: 'Invalid AI mode.' });
        return;
      }

      const suggestionId = crypto.randomUUID();
      const fileContext = String(fullFileContext ?? '');
      const selection = selectedCode && selectedCode.trim() ? String(selectedCode) : undefined;

      try {
        const context = buildCodeContext(fileContext, selection, language);

        await generateStreamingReview(context, mode, (token) => {
          io.to(roomId).emit('ai_stream_chunk', { suggestionId, token });
        });

        // Tells clients the text stream is finished (so they can stop showing
        // the "typing" state even in explain/review modes, which send no diff).
        // `summonedByName` lets every client attribute the request — the panel
        // shows "Alice asked for a review" instead of an anonymous stream.
        io.to(roomId).emit('ai_stream_end', { suggestionId, mode, summonedByName: user.displayName });

        if (mode === 'refactor') {
          const suggestion = await generateRefactorJSON(context);

          const state = rooms.get(roomId);
          if (state) {
            state.pendingSuggestions.set(suggestionId, {
              suggestionId,
              changes: suggestion.changes,
              userId: user.id,
              mode,
            });
          }

          io.to(roomId).emit('ai_suggestion_ready', {
            suggestionId,
            explanation: suggestion.explanation,
            changes: suggestion.changes,
            summonedByName: user.displayName,
          });
          logEdit(roomId, null, 'ai_suggestion', `Refactor suggestion: ${suggestion.explanation.slice(0, 120)}`);
        }
      } catch (err) {
        console.error('[socket] summon_ai failed:', err);
        io.to(roomId).emit('ai_error', {
          suggestionId,
          message: err instanceof Error ? err.message : 'The AI request failed. Please try again.',
        });
      }
    });

    // ──────────────────────── accept_suggestion ────────────────────────
    socket.on('accept_suggestion', (payload: unknown) => {
      const roomId = socket.data.roomId as string | undefined;
      const state = roomId ? rooms.get(roomId) : undefined;
      const { suggestionId } = (payload ?? {}) as { suggestionId?: string };

      if (!roomId || !state) {
        socket.emit('error', { message: 'Join a room before accepting suggestions.' });
        return;
      }
      if (!suggestionId) {
        socket.emit('error', { message: 'Missing suggestion id.' });
        return;
      }

      const pending = state.pendingSuggestions.get(suggestionId);
      if (!pending) {
        socket.emit('error', { message: 'Suggestion not found or it has expired.' });
        return;
      }

      try {
        applySuggestionToDoc(state, pending.changes, socket);
        state.pendingSuggestions.delete(suggestionId);

        const update = Y.encodeStateAsUpdate(state.doc);
        io.to(roomId).emit('yjs_update', { update: toBase64(update) });
        io.to(roomId).emit('ai_suggestion_accepted', { suggestionId });

        logEdit(roomId, user.id, 'ai_accepted', 'Accepted an AI refactor suggestion');
      } catch (err) {
        console.error('[socket] accept_suggestion failed:', err);
        socket.emit('error', { message: 'Failed to apply the suggestion.' });
      }
    });

    // ──────────────────────── reject_suggestion ────────────────────────
    socket.on('reject_suggestion', (payload: unknown) => {
      const roomId = socket.data.roomId as string | undefined;
      const state = roomId ? rooms.get(roomId) : undefined;
      const { suggestionId } = (payload ?? {}) as { suggestionId?: string };

      if (!roomId || !state) {
        socket.emit('error', { message: 'Join a room before rejecting suggestions.' });
        return;
      }
      if (!suggestionId) {
        socket.emit('error', { message: 'Missing suggestion id.' });
        return;
      }

      const existed = state.pendingSuggestions.delete(suggestionId);
      if (existed) {
        io.to(roomId).emit('ai_suggestion_rejected', { suggestionId });
        logEdit(roomId, user.id, 'ai_rejected', 'Rejected an AI refactor suggestion');
      }
    });

    // ───────────────────────────── disconnect ──────────────────────────
    socket.on('disconnect', async (reason: DisconnectReason) => {
      console.info(`[socket] ${user.displayName} disconnected (${socket.id}) — disconnecting due to: ${reason}`);
      const roomId = socket.data.roomId as string | undefined;
      if (roomId) {
        const state = rooms.get(roomId);
        if (state) await removeClientFromRoom(socket, state, roomId);
      }
    });
  });
};
