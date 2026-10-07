// Ghost-cursor regression test.
// Run from the client dir:  node ghost-cursor.test.mjs
//
// Reproduces the reported bug: a member closes their tab mid-session, but their
// cursor survives in the room's awareness. The join handler replays every live
// awareness state to a newcomer, so the next person to open the room sees a
// caret — often somewhere that no longer means anything — for someone who
// already left ("the cursors sometimes mismatch").
//
// After the fix, a disconnect purges that socket's awareness states and relays
// the removal, so a newcomer sees only the people who are actually there.

import { io } from 'socket.io-client';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const HOST = process.env.CODESYNC_HOST || 'http://127.0.0.1:5175';
const API = `${HOST}/api`;

const api = async (path, { method = 'POST', body, token } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : {} };
};

const uid = Math.random().toString(36).slice(2, 8);

const signup = async (name) => {
  const r = await api('/auth/signup', {
    body: { email: `e2e_${uid}_${name}@codesync.dev`, password: 'TestPass123!', displayName: name },
  });
  if (r.status !== 201) throw new Error(`signup failed for ${name}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.accessToken;
};

const connect = (token, label) =>
  new Promise((resolve, reject) => {
    const s = io(HOST, { transports: ['websocket'], auth: { token } });
    const timer = setTimeout(
      () => reject(new Error(`timeout connecting ${label}`)),
      8000
    );
    s.on('connect', () => {
      clearTimeout(timer);
      console.log(`  [${label}] connected — socket id ${s.id}`);
      resolve(s);
    });
    s.on('connect_error', (e) => {
      clearTimeout(timer);
      reject(new Error(`connect_error for ${label}: ${e.message}`));
    });
  });

const joinRoom = (s, roomId, label) =>
  new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      s.off('error', onError);
      resolve();
    };
    const onError = (e) => {
      clearTimeout(timer);
      s.off('room_state', done);
      reject(new Error(`join_room rejected for ${label}: ${JSON.stringify(e)}`));
    };
    const timer = setTimeout(() => {
      s.off('room_state', done);
      s.off('error', onError);
      reject(new Error(`timeout waiting for room_state for ${label}`));
    }, 8000);
    s.on('room_state', done);
    s.on('error', onError);
    s.emit('join_room', { roomId });
  });

const toBase64 = (bytes) => Buffer.from(bytes).toString('base64');
const fromBase64 = (value) => new Uint8Array(Buffer.from(value, 'base64'));

/** Membership is granted through the REST join endpoint — knowing a Room ID is
 *  not enough for the socket layer to let a caller in. */
const joinRest = async (roomId, token) => {
  const r = await api(`/rooms/${roomId}/join`, { token });
  if (r.status !== 200) throw new Error(`REST join failed: ${r.status} ${JSON.stringify(r.data)}`);
};

/** Hand-encodes one awareness state the way a real client would. */
const encodeAwareness = (clientID, clock, state) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 1); // a single client's state
  encoding.writeVarUint(encoder, clientID);
  encoding.writeVarUint(encoder, clock);
  encoding.writeVarString(encoder, JSON.stringify(state));
  return encoding.toUint8Array(encoder);
};

/** Decodes an incoming awareness update into { clientID, clock, state } tuples. */
const decodeAwareness = (bytes) => {
  const decoder = decoding.createDecoder(bytes);
  const len = decoding.readVarUint(decoder);
  const out = [];
  for (let i = 0; i < len; i++) {
    const clientID = decoding.readVarUint(decoder);
    const clock = decoding.readVarUint(decoder);
    const state = JSON.parse(decoding.readVarString(decoder));
    out.push({ clientID, clock, state });
  }
  return out;
};

let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? `  ${extra}` : ''}`);
  if (!ok) failures += 1;
};

const GHOST_ID = 900_001;
const LIVE_ID = 900_002;

const main = async () => {
  const ownerToken = await signup('Owner');
  const room = await api('/rooms', {
    body: { name: `Ghost E2E ${uid}`, isPublic: true, language: 'javascript' },
    token: ownerToken,
  });
  if (room.status !== 201) throw new Error(`room create failed: ${room.status} ${JSON.stringify(room.data)}`);
  const roomId = room.data.room._id;
  console.log(`  created ${room.data.room.name} (${roomId})`);

  // Alice — the member who will leave mid-session.
  const aliceToken = await signup('Alice');
  await joinRest(roomId, aliceToken);
  const alice = await connect(aliceToken, 'Alice');
  await joinRoom(alice, roomId, 'Alice');

  // Bob — stays for the whole session, so he can witness the removal relay.
  const bobToken = await signup('Bob');
  await joinRest(roomId, bobToken);
  const bob = await connect(bobToken, 'Bob');
  await joinRoom(bob, roomId, 'Bob');

  // Both publish a cursor position.
  alice.emit('awareness_update', {
    roomId,
    update: toBase64(encodeAwareness(GHOST_ID, 1, { user: { name: 'Alice', color: '#f87171' } })),
  });
  bob.emit('awareness_update', {
    roomId,
    update: toBase64(encodeAwareness(LIVE_ID, 1, { user: { name: 'Bob', color: '#4ade80' } })),
  });
  await new Promise((r) => setTimeout(r, 600));

  // ── 1. A newcomer DOES see the people who are present ────────────────────
  // This is the positive control: if the replay were broken entirely this would
  // fail, and the "no ghost" assertion below would be meaningless.
  console.log('\n== 1. a newcomer sees live collaborators ==');
  const carolToken = await signup('Carol');
  await joinRest(roomId, carolToken);
  const carol = await connect(carolToken, 'Carol');

  const replayed = await new Promise((resolve) => {
    const collected = new Map();
    const done = () => {
      clearTimeout(timer);
      carol.off('awareness_update', onAwareness);
      resolve(collected);
    };
    const onAwareness = (payload) => {
      if (payload?.roomId !== roomId) return;
      for (const entry of decodeAwareness(fromBase64(payload.update))) {
        collected.set(entry.clientID, entry.state);
      }
      // The replay arrives right after room_state; give it a beat to land.
      setTimeout(done, 250);
    };
    const timer = setTimeout(() => {
      carol.off('awareness_update', onAwareness);
      resolve(collected);
    }, 8000);
    carol.on('awareness_update', onAwareness);
    void joinRoom(carol, roomId, 'Carol');
  });

  check('Carol sees Bob (who is present)', replayed.has(LIVE_ID), `states: ${[...replayed.keys()].join(',')}`);
  check('Carol sees Alice (still present at this point)', replayed.has(GHOST_ID), '');

  await carol.disconnect();

  // ── 2. Alice leaves; her cursor must not survive her ─────────────────────
  console.log('\n== 2. a departing member’s cursor is purged ==');

  // Bob watches for the removal relay.
  const removal = await new Promise((resolve) => {
    const onAwareness = (payload) => {
      if (payload?.roomId !== roomId) return;
      const entries = decodeAwareness(fromBase64(payload.update));
      if (entries.some((e) => e.clientID === GHOST_ID && e.state === null)) {
        clearTimeout(timer);
        bob.off('awareness_update', onAwareness);
        resolve(true);
      }
    };
    const timer = setTimeout(() => {
      bob.off('awareness_update', onAwareness);
      resolve(false);
    }, 8000);
    bob.on('awareness_update', onAwareness);
    alice.disconnect(); // the event under test
  });

  check('Bob received the removal broadcast', removal === true, '');

  await new Promise((r) => setTimeout(r, 700));

  // A brand-new member joins — the incognito window in the bug report.
  const daveToken = await signup('Dave');
  await joinRest(roomId, daveToken);
  const dave = await connect(daveToken, 'Dave');

  // The replay and the presence list both arrive as part of the join handshake,
  // so listen before emitting join_room or the events are already gone.
  const daveSeen = await new Promise((resolve) => {
    const collected = new Map();
    let presenceUsers = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      dave.off('awareness_update', onAwareness);
      dave.off('presence_update', onPresence);
      resolve({ awareness: collected, presence: presenceUsers });
    };

    const onAwareness = (payload) => {
      if (payload?.roomId !== roomId) return;
      for (const entry of decodeAwareness(fromBase64(payload.update))) {
        collected.set(entry.clientID, entry.state);
      }
      setTimeout(finish, 250);
    };
    const onPresence = (payload) => {
      if (Array.isArray(payload?.users)) presenceUsers = payload.users;
      setTimeout(finish, 250);
    };
    const timer = setTimeout(() => {
      dave.off('awareness_update', onAwareness);
      dave.off('presence_update', onPresence);
      resolve({ awareness: collected, presence: presenceUsers });
    }, 8000);

    dave.on('awareness_update', onAwareness);
    dave.on('presence_update', onPresence);
    dave.emit('join_room', { roomId });
  });

  const daveReplay = daveSeen.awareness;

  check('Dave sees Bob (still in the room)', daveReplay.has(LIVE_ID), `states: ${[...daveReplay.keys()].join(',')}`);
  check('Dave does NOT see Alice’s stale cursor', !daveReplay.has(GHOST_ID), 'no ghost cursor on join');

  // ── 3. Presence agrees with the cursors ───────────────────────────────────
  const names = (daveSeen.presence ?? []).map((u) => u.displayName).sort();
  check('presence lists only Bob and Dave', JSON.stringify(names) === JSON.stringify(['Bob', 'Dave']), JSON.stringify(names));

  await dave.disconnect();
  await bob.disconnect();

  console.log(`\n${failures === 0 ? '✅ ALL GHOST-CURSOR CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((err) => {
  console.error('ghost-cursor test crashed:', err);
  process.exit(1);
});
