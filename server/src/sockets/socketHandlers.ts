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
import { normalizeLanguage, DEFAULT_LANGUAGE } from '../utils/languages';
import { starterContent, classifyStarter } from '../utils/starterContent';
import { env } from '../config/env';

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
  /**
   * The room's language as this process last persisted it. It is the
   * `previous` a language switch converts FROM, so it has to be tracked here —
   * reading a client's React state (or re-reading Mongo mid-flight) would let
   * two members disagree about what the document currently is.
   */
  language: string;
}

// ───────────────────────────── In-memory rooms ─────────────────────────────

const rooms = new Map<string, RoomState>();
const PERSIST_INTERVAL_MS = 30_000;
const HUMAN_EDIT_LOG_THROTTLE_MS = 3_000;
// Cap how many pre-join updates we hold for one socket. These only exist to
// close the reconnect ordering race (see yjs_update); the two-step sync
// recovers anything beyond this, so the bound just guards memory.
const MAX_QUEUED_UPDATES = 500;
/**
 * Cap on an uploaded file, in BYTES (UTF-8 encoded, so a multi-byte character
 * counts as more than one). Matches the client's gate — the client refuses to
 * read a file this big, this one refuses to store it regardless of who asks.
 */
const MAX_UPLOAD_BYTES = 1024 * 1024;

/**
 * Rooms in the middle of an admin close/delete. A join that races the teardown
 * — it read the Room doc before we deleted it, then reached
 * getOrCreateRoomState after — would otherwise resurrect a fresh in-memory
 * state for a room that no longer exists, and the tombstone'd doc delete would
 * then leave that state orphaned and writing to Mongo forever. Entries expire
 * after the teardown is certain to have finished.
 */
const tombstones = new Map<string, number>();
const TOMBSTONE_TTL_MS = 30_000;

const addTombstone = (roomId: string): void => {
  tombstones.set(roomId, Date.now() + TOMBSTONE_TTL_MS);
};

/** True while a teardown is in flight (and clears stale entries as it goes). */
const hasTombstone = (roomId: string): boolean => {
  const expiry = tombstones.get(roomId);
  if (expiry === undefined) return false;
  if (Date.now() <= expiry) return true;
  tombstones.delete(roomId);
  return false;
};

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

/**
 * Builds a fresh RoomState, restoring the persisted snapshot so content
 * survives server restarts. Callers go through `getOrCreateRoomState`, never
 * this directly.
 */
const createRoomState = async (roomId: string): Promise<RoomState> => {
  const doc = new Y.Doc();
  doc.getText('content'); // ensure the shared text exists
  const awareness = new awarenessProtocol.Awareness(doc);

  let language = DEFAULT_LANGUAGE;
  // Set only for a room that has never had a snapshot written. Distinguishing
  // "never saved" from "saved empty" matters: someone who deliberately cleared
  // the file must not get the welcome snippet back after every restart.
  let neverSaved = false;

  try {
    const room = await Room.findById(roomId).lean();
    language = normalizeLanguage(room?.language);
    const persisted = yjsStateToUint8(room?.yjsDocState);
    if (persisted && persisted.length) {
      Y.applyUpdate(doc, persisted);
      console.log(`[socket] Restored ${persisted.length}b of persisted state for room ${roomId}`);
    } else if (room && !room.yjsDocState) {
      neverSaved = true;
    }
  } catch (err) {
    console.warn(`[socket] Could not restore persisted state for room ${roomId}:`, err);
  }

  // Seed on the SERVER, in the room's own language, for a room nothing has
  // ever been written to. Every member then opens on a document that already
  // matches the status bar from the first frame — no racing the REST fetch for
  // the language the client should seed with, and no two members seeding
  // different snippets into the same empty doc.
  if (neverSaved) {
    doc.transact(() => {
      doc.getText('content').insert(0, starterContent(language));
    });
    console.log(`[socket] Seeded the ${language} welcome snippet for new room ${roomId}`);
  }

  const state: RoomState = {
    doc,
    awareness,
    clients: new Map(),
    pendingSuggestions: new Map(),
    saveTimer: null,
    lastHumanEditLog: 0,
    language,
  };

  state.saveTimer = setInterval(() => {
    void persistRoom(roomId, state);
  }, PERSIST_INTERVAL_MS);

  rooms.set(roomId, state);
  return state;
};

// In-flight creations, keyed by room. Without single-flight, two concurrent
// joins that both miss the cache each build a state and the second
// `rooms.set` orphans the first — along with its saveTimer, which keeps
// writing a stale doc over Mongo every 30s for the whole process lifetime.
const pendingRoomState = new Map<string, Promise<RoomState>>();

const getOrCreateRoomState = async (roomId: string): Promise<RoomState> => {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  // A teardown is mid-flight for this room — refuse instead of resurrecting
  // state for a room on its way out (see the tombstone comment).
  if (hasTombstone(roomId)) throw new Error('Room is closing');

  const inFlight = pendingRoomState.get(roomId);
  if (inFlight) return inFlight;

  const creating = createRoomState(roomId).finally(() => {
    pendingRoomState.delete(roomId);
  });
  pendingRoomState.set(roomId, creating);
  return creating;
};

/**
 * Evicts an empty room, but only once it is STILL empty after the persist
 * completes. The `await persistRoom` is the race window: a client that joins
 * in it would come back to a room deleted out from under it, after which
 * every edit it makes silently hits the "no live state" guard until reload.
 */
const evictRoomIfEmpty = async (roomId: string, state: RoomState): Promise<boolean> => {
  if (state.clients.size !== 0) return false;

  await persistRoom(roomId, state);

  // Re-check AFTER the await — a join during the persist keeps the room alive.
  if (state.clients.size !== 0) return false;

  // Only clear the timer once we are really evicting; if a client joined
  // during the persist the room still needs it.
  if (state.saveTimer) clearInterval(state.saveTimer);
  rooms.delete(roomId);
  return true;
};

const removeClientFromRoom = async (socket: Socket, state: RoomState, roomId: string): Promise<void> => {
  state.clients.delete(socket.id);
  socket.leave(roomId);

  const evicted = await evictRoomIfEmpty(roomId, state);
  if (!evicted) {
    socket.to(roomId).emit('presence_update', { users: Array.from(state.clients.values()) });
  }
};

/**
 * Persists every live room. Called on shutdown — without it a deploy or
 * restart discards up to PERSIST_INTERVAL_MS of edits, and the mongoose
 * disconnect races the process exit.
 */
export const flushAllRooms = async (): Promise<void> => {
  // Snapshot the ids first: a client disconnecting mid-flip can evict a room
  // under us while we iterate.
  const ids = [...rooms.keys()];
  for (const roomId of ids) {
    const state = rooms.get(roomId);
    if (!state) continue;
    if (state.saveTimer) clearInterval(state.saveTimer);
    await persistRoom(roomId, state);
  }
  if (ids.length) console.info(`[socket] persisted ${ids.length} room(s) on shutdown`);
};

/**
 * Admin room teardown. The io instance is captured at registration, so callers
 * from the REST layer never have to thread it through themselves. Order is
 * load-bearing:
 *
 *   1. tell everyone in the room it is gone (clients toast + leave the page),
 *   2. disconnect those sockets so no further edits can land mid-teardown,
 *   3. clear the save timer and drop the in-memory state,
 *   4. delete the DB records.
 *
 * The tombstone is set BEFORE step 1 so a join racing through the window
 * between "doc still exists" and "state deleted" hits the tombstone in
 * getOrCreateRoomState instead of rebuilding a room we are about to destroy.
 */
let ioRef: Server | null = null;

export const getIo = (): Server | null => ioRef;

/**
 * Force-closes a room's live session: kicks every occupant and drops the
 * in-memory Yjs state, but keeps the persisted document. Two-step delete uses
 * this as step one, and it is also exposed directly so an admin can empty a
 * room without deleting its content. Returns how many occupants were kicked.
 */
export const closeRoom = async (roomId: string, reason: string): Promise<number> => {
  const io = ioRef;
  const state = rooms.get(roomId);
  if (!io || !state) return 0;

  addTombstone(roomId);
  const occupantCount = state.clients.size;

  // Step 1 — the payload drives the client's toast copy.
  io.to(roomId).emit('room_closed', { roomId, reason });

  // Step 2 — `true` closes the underlying transport, not just the namespace
  // room. Disconnecting before tearing down means no edit can arrive between
  // here and the DB delete.
  io.in(roomId).disconnectSockets(true);

  // Step 3 — the clients map is drained by the disconnect handler, but the
  // save timer would otherwise keep writing the (now abandoned) doc forever.
  if (state.saveTimer) clearInterval(state.saveTimer);
  rooms.delete(roomId);
  pendingRoomState.delete(roomId);

  console.info(`[socket] admin closed room ${roomId} (${reason}) — ${occupantCount} occupant(s) kicked`);
  return occupantCount;
};

/**
 * Live occupancy for the admin panel — the one stat the DB cannot answer,
 * since it lives in the in-memory room map.
 */
export const getLiveOccupancy = (): Array<{ roomId: string; occupants: string[] }> =>
  [...rooms.entries()].map(([roomId, state]) => ({
    roomId,
    occupants: [...state.clients.values()].map((client) => client.displayName),
  }));

/**
 * Deletes a room outright: closes the live session, then removes the room and
 * its edit history. Requires the caller to have already confirmed access —
 * this is the step-two half of the two-step admin delete.
 */
export const deleteRoom = async (roomId: string, reason: string): Promise<{ kicked: number }> => {
  const kicked = await closeRoom(roomId, reason);

  // Step 4 — order matters: delete the room first so a join that slips past
  // the (now expired) tombstone still finds nothing to open.
  await Room.deleteOne({ _id: roomId });
  await EditHistory.deleteMany({ roomId });

  console.info(`[socket] admin deleted room ${roomId} (${reason})`);
  return { kicked };
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

/**
 * Serialises room-mutating work per room: language changes AND file uploads.
 * Both handlers await a database write before broadcasting, so without this
 * two of them in quick succession (JS → Python, or a switch racing an upload)
 * can interleave at the await and have the *older* result broadcast last —
 * leaving every collaborator on a different language or document than the
 * room is actually stored as. Chaining keeps "persist then broadcast" atomic
 * per room, and makes an upload unable to race a concurrent language switch.
 */
const roomMutationQueues = new Map<string, Promise<void>>();

const enqueueRoomMutation = (roomId: string, work: () => Promise<void>): void => {
  const previous = roomMutationQueues.get(roomId) ?? Promise.resolve();
  const next = previous.then(work, work);
  roomMutationQueues.set(roomId, next);
  // Keep the map from growing without bound once the chain has settled.
  const settle = (): void => {
    if (roomMutationQueues.get(roomId) === next) roomMutationQueues.delete(roomId);
  };
  void next.then(settle, settle);
};

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

/**
 * Applies one encoded update to the room doc and relays it to everyone else.
 * The payload carries the roomId so a client that is somehow still listening
 * for the wrong room can filter it rather than apply it to the wrong doc.
 */
const applyAndBroadcast = (
  roomId: string,
  state: RoomState,
  updateBase64: string,
  socket: Socket,
  userId: string
): void => {
  Y.applyUpdate(state.doc, fromBase64(updateBase64), socket);
  // `socket.to()` excludes the sender, so its own edits are not echoed back.
  socket.to(roomId).emit('yjs_update', { update: updateBase64, roomId });
  if (env.socketDebug) {
    const others = Math.max(0, state.clients.size - 1);
    console.log(`[server] yjs_update for room ${roomId} from ${socket.id} (${others} other client(s))`);
  }
  logHumanEditThrottled(roomId, state, userId);
};

/**
 * Rewrites the document with `nextLanguage`'s welcome snippet when the current
 * content still is (or still looks like) the sample, and reports whether it did.
 *
 * This is decided HERE, from the live document, never from what the client
 * claims — the defect this exists to fix was a client that silently declined to
 * swap and left the room's language and its content permanently disagreeing.
 * `wantsReplace` is only the user's answer to the ambiguity prompt: it is
 * honoured for content this classifier also considers sample-like, an untouched
 * starter is swapped regardless, and content we classify as real work is never
 * touched however much the client asks.
 */
const replaceStarterIfAsked = (
  io: Server,
  roomId: string,
  state: RoomState,
  nextLanguage: string,
  wantsReplace: boolean,
  userId: string
): boolean => {
  const text = state.doc.getText('content').toString();
  const next = starterContent(nextLanguage);
  if (text === next) return false;

  const kind = classifyStarter(text);
  const shouldReplace = kind === 'exact' || (kind === 'sample-like' && wantsReplace);
  if (!shouldReplace) return false;

  state.doc.transact(() => {
    const target = state.doc.getText('content');
    target.delete(0, target.length);
    target.insert(0, next);
  }, 'language_change');

  // No socket owns this edit — the server made it — so unlike applyAndBroadcast
  // there is no sender to exclude. Everyone in the room, the instigator
  // included, receives it as an ordinary Yjs update and converges exactly as
  // they do on a typed edit.
  const update = Y.encodeStateAsUpdate(state.doc);
  io.to(roomId).emit('yjs_update', { update: toBase64(update), roomId });

  logEdit(roomId, userId, 'human_edit', `Language changed to ${nextLanguage} — welcome snippet rewritten`);
  return true;
};

/**
 * The authoritative room for an incoming packet is `socket.data.roomId` (a
 * socket lives in exactly one room in this app). If the packet also names a
 * room and it disagrees, the packet is a cross-room leak and is rejected.
 */
const resolveRoomId = (socket: Socket, payloadRoomId: unknown): string | null => {
  const current = socket.data.roomId as string | undefined;
  if (!current) return null;
  if (typeof payloadRoomId === 'string' && payloadRoomId !== current) return null;
  return current;
};

// ───────────────────────────── Auth middleware ─────────────────────────────

export const registerSocketHandlers = (io: Server): void => {
  ioRef = io;
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
      const { roomId, stateVector } = (payload ?? {}) as { roomId?: string; stateVector?: string };
      console.log(`[server] join_room received from socket ${socket.id} for room ${roomId ?? '(missing)'}`);

      try {
        if (!roomId || typeof roomId !== 'string') {
          socket.emit('error', { message: 'Invalid room id.' });
          return;
        }

        // Claim the room BEFORE the first await. socket.io processes packets
        // in arrival order, so an update queued behind this handler sees a
        // resolved roomId as soon as we first yield. (Updates that arrived
        // even earlier — flushed from the client's send buffer ahead of this
        // join — are queued in the yjs_update handler and flushed below.)
        socket.data.roomId = roomId;

        const room = await Room.findById(roomId).lean();
        if (!room) {
          delete socket.data.roomId;
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
          delete socket.data.roomId;
          console.warn(`[server] socket ${socket.id} denied room ${roomId} — not a member`);
          socket.emit('error', { message: 'You need to join this room first.' });
          return;
        }

        let state: RoomState;
        try {
          state = await getOrCreateRoomState(roomId);
        } catch {
          // A tombstone from an admin teardown beat us: the room is gone (or
          // going). Report it as "not found" so the client routes to the
          // dashboard rather than retrying a join that can never succeed.
          delete socket.data.roomId;
          console.warn(`[server] socket ${socket.id} — room ${roomId} is closing`);
          socket.emit('error', { message: 'This room is being closed. Please head back to the dashboard.' });
          return;
        }
        socket.join(roomId);
        // Confirms the Socket.io room membership actually happened — without
        // this, `socket.to(roomId)` broadcasts silently reach nobody.
        console.log(`[server] socket ${socket.id} joined Socket.io room ${roomId}`);
        state.clients.set(socket.id, {
          userId: user.id,
          displayName: user.displayName,
          color: colorFor(user.id),
        });

        // Replays any updates that beat this join — socket.io flushes the
        // client's send buffer (offline edits) before replaying our
        // 'connect' handler, so they can land ahead of join_room. Applying
        // them now means the diff below is computed against a current doc.
        const queued = (socket.data.pendingUpdates as string[] | undefined) ?? [];
        socket.data.pendingUpdates = [];
        for (const update of queued) {
          applyAndBroadcast(roomId, state, update, socket, user.id);
        }

        // Sync step 1 reply. Instead of sending the whole doc, send only
        // what THIS client is missing, computed against the state vector it
        // just handed us. Falls back to the full doc for a client that
        // sends no vector.
        const clientSV = typeof stateVector === 'string' && stateVector.length ? fromBase64(stateVector) : null;
        const reply = clientSV ? Y.encodeStateAsUpdate(state.doc, clientSV) : Y.encodeStateAsUpdate(state.doc);

        // Ship our own state vector too — sync step 2 request — so the
        // client can send back whatever we are missing from it. That is what
        // recovers edits made while offline: without it, a clock gap left
        // the server's follow-up updates parked in pendingStructs forever.
        socket.emit('room_state', {
          update: toBase64(reply),
          stateVector: toBase64(Y.encodeStateVector(state.doc)),
          presence: Array.from(state.clients.values()),
          // The room's own language, so a client that seeds an empty document
          // uses the same one the status bar is about to show rather than
          // whichever language its REST fetch happened to land on first.
          language: state.language,
        });

        // Replay every collaborator's current awareness to the newcomer.
        // Awareness is only broadcast on change, so without this a fresh join
        // would show no remote cursors until someone else happened to move.
        const awarenessClients = Array.from(state.awareness.getStates().keys());
        if (awarenessClients.length > 0) {
          socket.emit('awareness_update', {
            update: toBase64(awarenessProtocol.encodeAwarenessUpdate(state.awareness, awarenessClients)),
            roomId,
          });
        }

        io.to(roomId).emit('presence_update', { users: Array.from(state.clients.values()) });
      } catch (err) {
        console.error('[socket] join_room failed:', err);
        socket.emit('error', { message: 'Failed to join the room.' });
      }
    });

    // ─────────────────────────── yjs_update ────────────────────────────
    socket.on('yjs_update', (payload: unknown) => {
      try {
        const { update, roomId: payloadRoomId } = (payload ?? {}) as { update?: string; roomId?: string };
        if (typeof update !== 'string') return;

        const roomId = resolveRoomId(socket, payloadRoomId);
        if (!roomId) {
          // Reconnect race: socket.io flushes the client's send buffer
          // (edits made while offline) BEFORE replaying its 'connect'
          // handler, so this update can beat its own join_room. Hold it
          // until the join completes instead of dropping it forever — the
          // two-step sync then reconciles anything this misses.
          const hasJoined = Boolean(socket.data.roomId);
          if (!hasJoined) {
            const queue = (socket.data.pendingUpdates as string[] | undefined) ?? [];
            if (queue.length < MAX_QUEUED_UPDATES) {
              queue.push(update);
              socket.data.pendingUpdates = queue;
            } else if (env.socketDebug) {
              console.warn(`[server] socket ${socket.id} overflowed its pre-join update queue`);
            }
          }
          return;
        }

        const state = rooms.get(roomId);
        if (!state) {
          if (env.socketDebug) {
            console.warn(`[server] yjs_update from socket ${socket.id} — room ${roomId} has no live state`);
          }
          return;
        }

        applyAndBroadcast(roomId, state, update, socket, user.id);
      } catch (err) {
        console.error('[socket] yjs_update failed:', err);
      }
    });

    // ─────────────────────────── sync_step_2 ───────────────────────────
    // The client's reply to the state vector we sent in room_state: everything
    // the server is missing from it. On a clean join this is empty; after a
    // reconnect it carries the offline edits — including any that arrived
    // before join_room and had to be queued, and any the client made while
    // we were computing the diff.
    socket.on('sync_step_2', (payload: unknown) => {
      try {
        const { update, roomId: payloadRoomId } = (payload ?? {}) as { update?: string; roomId?: string };
        if (typeof update !== 'string') return;

        const roomId = resolveRoomId(socket, payloadRoomId);
        if (!roomId) return;

        const state = rooms.get(roomId);
        if (!state) {
          if (env.socketDebug) {
            console.warn(`[server] sync_step_2 from socket ${socket.id} — room ${roomId} has no live state`);
          }
          return;
        }

        applyAndBroadcast(roomId, state, update, socket, user.id);
      } catch (err) {
        console.error('[socket] sync_step_2 failed:', err);
      }
    });

    // ───────────────────────── leave_room ──────────────────────────────
    // Navigating room A → B reuses one socket. Without an explicit leave the
    // socket stays in Socket.io room A, and A's broadcasts (which carry no
    // room context the client could trust) were applied into B's document.
    socket.on('leave_room', async (payload: unknown) => {
      const { roomId } = (payload ?? {}) as { roomId?: string };
      if (!roomId || typeof roomId !== 'string') return;
      if (socket.data.roomId !== roomId) return; // not in this room

      const state = rooms.get(roomId);
      if (state) await removeClientFromRoom(socket, state, roomId);
      delete socket.data.roomId;

      if (env.socketDebug) console.log(`[server] socket ${socket.id} left room ${roomId}`);
    });

    // ──────────────────────── awareness_update ────────────────────────
    socket.on('awareness_update', (payload: unknown) => {
      try {
        const { update, roomId: payloadRoomId } = (payload ?? {}) as { update?: string; roomId?: string };
        if (typeof update !== 'string') return;

        const roomId = resolveRoomId(socket, payloadRoomId);
        if (!roomId) return;

        const state = rooms.get(roomId);
        if (!state) return;

        // Remember the Yjs client ids this connection has published awareness
        // for, so a disconnect can purge them. Awareness states are keyed by the
        // publisher's Y.Doc clientID (not the socket id), and y-protocols never
        // clears them on its own — without this record a closed tab's caret
        // would outlive it. See the disconnect handler.
        const captured: number[] = [];
        const capture = ({ added, updated }: { added: number[]; updated: number[] }) => {
          for (const id of added) captured.push(id);
          for (const id of updated) captured.push(id);
        };
        state.awareness.on('update', capture);
        try {
          awarenessProtocol.applyAwarenessUpdate(state.awareness, fromBase64(update), socket);
        } finally {
          state.awareness.off('update', capture);
        }
        if (captured.length) {
          const known = new Set<number>([
            ...((socket.data.awarenessClientIds as number[] | undefined) ?? []),
            ...captured,
          ]);
          socket.data.awarenessClientIds = [...known];
        }

        socket.to(roomId).emit('awareness_update', { update, roomId });
      } catch (err) {
        console.error('[socket] awareness_update failed:', err);
      }
    });

    // ──────────────────────── change_language ─────────────────────────────
    // A member switched the language in the status bar. The room is the source
    // of truth: persist first, then broadcast what actually got stored to
    // everyone in the room. Sending the persisted value means an out-of-range
    // language is corrected rather than half-applied, and every browser lands on
    // the same mode.
    //
    // The welcome-snippet swap happens HERE rather than in the switcher, so
    // there is exactly one authority for what the document becomes and every
    // member converges on it in the same tick as the language. The switcher
    // classifies the document to decide whether to ask the user first, but its
    // answer is only a hint — replaceStarterIfAsked re-classifies the live
    // document and refuses to touch anything that is not still the sample.
    socket.on('change_language', (payload: unknown) => {
      const { language: requested, roomId: payloadRoomId, snippet } = (payload ?? {}) as {
        language?: string;
        roomId?: string;
        snippet?: unknown;
      };

      // resolveRoomId rejects anything from a socket that has not joined this
      // room, so only a genuine member can switch the language.
      const roomId = resolveRoomId(socket, payloadRoomId);
      if (!roomId) {
        socket.emit('error', { message: 'Join a room before changing its language.' });
        return;
      }
      if (!rooms.has(roomId)) {
        socket.emit('error', { message: 'This room is not live right now.' });
        return;
      }

      const next = normalizeLanguage(requested);
      // The user's answer to "this document still looks like the sample but has
      // been edited — replace it?". Absent/`keep` means keep the content.
      const wantsReplace = snippet === 'replace';

      enqueueRoomMutation(roomId, async () => {
        const state = rooms.get(roomId);
        // The room can be evicted while this waits its turn in the queue.
        if (!state) return;

        try {
          await Room.updateOne({ _id: roomId }, { $set: { language: next } });
        } catch (err) {
          // Never broadcast a language we failed to store — the room and its
          // members would then disagree with the document.
          console.error(`[socket] Failed to persist language for room ${roomId}:`, err);
          return;
        }
        state.language = next;

        const snippetReplaced = replaceStarterIfAsked(io, roomId, state, next, wantsReplace, user.id);
        // The rewrite is content, not a language field — persist it now rather
        // than leaving it up to the 30s snapshot timer, or a restart would put
        // the old snippet back under the new language and recreate the exact
        // mismatch this handler exists to prevent.
        if (snippetReplaced) await persistRoom(roomId, state);

        io.to(roomId).emit('language_changed', { roomId, language: next, snippetReplaced });
      });
    });

    // ────────────────────────── upload_file ──────────────────────────────
    // A member replaced the document with a file from their machine. Same
    // shape as change_language and on the SAME per-room queue, so an upload
    // can never interleave with a language switch and land the room with one
    // of the two halves applied. The client has already validated the file;
    // everything is checked again here because the socket is the boundary.
    socket.on('upload_file', (payload: unknown) => {
      const { content, language: requested, roomId: payloadRoomId } = (payload ?? {}) as {
        content?: unknown;
        language?: unknown;
        roomId?: string;
      };

      const roomId = resolveRoomId(socket, payloadRoomId);
      if (!roomId) {
        socket.emit('error', { message: 'Join a room before uploading a file.' });
        return;
      }
      if (!rooms.has(roomId)) {
        socket.emit('error', { message: 'This room is not live right now.' });
        return;
      }

      if (typeof content !== 'string') {
        socket.emit('error', { message: 'That file could not be read as text.' });
        return;
      }
      // Re-check the size the client already checked: the socket will accept
      // whatever it is sent, so the cap has to exist on both sides.
      if (Buffer.byteLength(content, 'utf8') > MAX_UPLOAD_BYTES) {
        socket.emit('error', { message: 'That file is too large — uploads are capped at 1 MB.' });
        return;
      }
      // `normalizeLanguage` maps anything unknown to the default rather than
      // rejecting it, so comparing against what it would store is what makes
      // this a validation: an unrecognised language is refused instead of
      // silently downgrading the room to JavaScript.
      const next = normalizeLanguage(requested);
      if (typeof requested !== 'string' || next !== requested.toLowerCase()) {
        socket.emit('error', { message: 'Unsupported language for that upload.' });
        return;
      }

      enqueueRoomMutation(roomId, async () => {
        const state = rooms.get(roomId);
        if (!state) return;

        try {
          await Room.updateOne({ _id: roomId }, { $set: { language: next } });
        } catch (err) {
          console.error(`[socket] Failed to persist language for room ${roomId}:`, err);
          return;
        }
        state.language = next;

        // One transaction, same shape as the starter rewrite: clear, insert,
        // tagged so anything observing the origin can tell this apart from a
        // typed edit. Deleting and inserting together means collaborators
        // receive a single coherent replacement rather than a delete and an
        // insert they could interleave with their own typing.
        state.doc.transact(() => {
          const target = state.doc.getText('content');
          target.delete(0, target.length);
          target.insert(0, content);
        }, 'file_upload');

        // Persist immediately rather than waiting for the 30s snapshot timer:
        // this is real content, and a restart before the timer fired would put
        // the old document back under the newly stored language.
        await persistRoom(roomId, state);

        // Everyone, the uploader included: this edit has no sender socket to
        // exclude, because the server made it (see replaceStarterIfAsked).
        const update = Y.encodeStateAsUpdate(state.doc);
        io.to(roomId).emit('yjs_update', { update: toBase64(update), roomId });

        logEdit(roomId, user.id, 'human_edit', 'File uploaded — replaced document');

        // Sent AFTER the bytes so every client's status bar and Monaco mode
        // flip together with the content it belongs to.
        io.to(roomId).emit('language_changed', { roomId, language: next, snippetReplaced: false });
      });
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
        io.to(roomId).emit('yjs_update', { update: toBase64(update), roomId });
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
      const state = roomId ? rooms.get(roomId) : undefined;

      // Drop this connection's cursors and selections from the room. y-protocols
      // will not do it: its own expiry only fires from a timer, so a tab closed
      // mid-session leaves its caret behind in `awareness`, and the join handler
      // then replays that stale state to everyone who opens the room afterwards —
      // painting a cursor, at a position that no longer means anything, for
      // someone who already left.
      const clientIds = (socket.data.awarenessClientIds as number[] | undefined) ?? [];
      if (state && clientIds.length) {
        const live = clientIds.filter((id) => state.awareness.getStates().has(id));
        if (live.length) {
          awarenessProtocol.removeAwarenessStates(state.awareness, live, null);
          // Relay the removal so anyone still in the room stops drawing the
          // cursor now, rather than up to 30s later when it times out.
          const removal = awarenessProtocol.encodeAwarenessUpdate(state.awareness, live);
          io.to(roomId as string).emit('awareness_update', {
            update: toBase64(removal),
            roomId,
          });
        }
      }

      if (roomId && state) await removeClientFromRoom(socket, state, roomId);
      // Nothing is joining this socket anymore; drop any unreplayed queue.
      socket.data.pendingUpdates = [];
    });
  });
};
