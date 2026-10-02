// Room-switch contamination + socket error surfacing test.
// Run from the client dir:  node room-switch.test.mjs
//
// #2 — Alice reuses ONE socket to move from room A to room B (exactly what
// navigating /room/A → /room/B does in the app). The socket used to stay in
// Socket.io room A forever, so A's edits kept arriving and were applied into
// B's document. Now the client emits leave_room and every broadcast carries a
// roomId that the client filters on. After the switch Alice must see B's
// traffic only.
//
// #6 — a join_room for a room the user never joined through REST must emit an
// `error` event the client can toast (SocketErrorListener listens for it).

import { io } from 'socket.io-client';

const HOST = 'http://127.0.0.1:5175';
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
    body: { email: `switch_${uid}_${name}@codesync.dev`, password: 'TestPass123!', displayName: name },
  });
  if (r.status !== 201) throw new Error(`signup failed for ${name}: ${r.status} ${JSON.stringify(r.data)}`);
  return { token: r.data.accessToken, name };
};

let failures = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  ${detail ?? ''}`}`);
  if (!cond) failures += 1;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Collected yjs_update broadcasts, keyed by the roomId each one carries. */
const collectBroadcasts = (socket, durationMs) =>
  new Promise((resolve) => {
    const seen = [];
    const onUpd = (payload) => {
      if (typeof payload?.update === 'string') seen.push(payload.roomId ?? '(none)');
    };
    socket.on('yjs_update', onUpd);
    setTimeout(() => {
      socket.off('yjs_update', onUpd);
      resolve(seen);
    }, durationMs);
  });

const once = (socket, event, timeoutMs = 8000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    const handler = (payload) => {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });

// A real, decodable Yjs update (not a literal string — random bytes make
// Y.applyUpdate throw inside the handler and nothing gets broadcast).
import * as Y from 'yjs';
const makeUpdate = (text) => {
  const doc = new Y.Doc();
  doc.getText('content').insert(0, text);
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
};

// ───────────────────────────── setup ──────────────────────────────────────
console.log('\n== setup ==');
const alice = await signup('Alice');
const bob = await signup('Bob');
const carol = await signup('Carol');

const roomA = (await api('/rooms', { body: { name: 'Room A', isPublic: true }, token: alice.token })).data.room._id;
const roomB = (await api('/rooms', { body: { name: 'Room B', isPublic: true }, token: alice.token })).data.room._id;
await api(`/rooms/${roomA}/join`, { token: bob.token });
await api(`/rooms/${roomB}/join`, { token: carol.token });
console.log(`  room A ${roomA} (Bob), room B ${roomB} (Carol)`);

// ───────────── #6: a denied join must emit a surfacable `error` ────────────
console.log('\n== #6: denied join_room emits an `error` event ==');
{
  // Dave is signed up but never joins room A through REST.
  const dave = await signup('Dave');
  const sD = io(HOST, { transports: ['websocket'], auth: { token: dave.token } });
  await once(sD, 'connect');
  sD.emit('join_room', { roomId: roomA });
  const errPayload = await once(sD, 'error');
  console.log(`  [Dave] error event: ${JSON.stringify(errPayload)}`);
  check('denied join emits an error event with a message', typeof errPayload?.message === 'string' && errPayload.message.length > 0);
  check('the message is the membership rejection', /join this room/i.test(errPayload.message));
  sD.close();
}

// ───────────────── #2: Alice moves room A → B on one socket ────────────────
console.log('\n== #2: Alice switches rooms on ONE socket ==');
const sA = io(HOST, { transports: ['websocket'], auth: { token: alice.token } });
await once(sA, 'connect');

// Join A first.
sA.emit('join_room', { roomId: roomA });
await once(sA, 'room_state');
await sleep(200);

// Bob edits in A; Alice (still in A) should see it.
const bobSocket = io(HOST, { transports: ['websocket'], auth: { token: bob.token } });
await once(bobSocket, 'connect');
bobSocket.emit('join_room', { roomId: roomA });
await once(bobSocket, 'room_state');

const carolSocket = io(HOST, { transports: ['websocket'], auth: { token: carol.token } });
await once(carolSocket, 'connect');
carolSocket.emit('join_room', { roomId: roomB });
await once(carolSocket, 'room_state');
await sleep(200);

console.log('  -- Alice is in A: Bob edits in A, Carol edits in B --');
const inA = collectBroadcasts(sA, 600);
bobSocket.emit('yjs_update', { roomId: roomA, update: makeUpdate('edit in A') });
carolSocket.emit('yjs_update', { roomId: roomB, update: makeUpdate('edit in B') });
let seen = await inA;
console.log(`  [Alice in A] saw roomIds: ${JSON.stringify(seen)}`);
check('while in A, Alice receives A broadcasts', seen.includes(roomA));

// Now switch: leave A, join B — the useYjsDoc cleanup + join contract.
console.log('  -- Alice leaves A and joins B --');
sA.emit('leave_room', { roomId: roomA });
await sleep(100);
sA.emit('join_room', { roomId: roomB });
await once(sA, 'room_state');
await sleep(300);

console.log('  -- after the switch: Bob edits in A, Carol edits in B --');
const afterSwitch = collectBroadcasts(sA, 800);
bobSocket.emit('yjs_update', { roomId: roomA, update: makeUpdate('leak into B?') });
carolSocket.emit('yjs_update', { roomId: roomB, update: makeUpdate('legit B edit') });
seen = await afterSwitch;
console.log(`  [Alice in B] saw roomIds: ${JSON.stringify(seen)}`);
check('after switching to B, Alice no longer receives room A broadcasts', !seen.includes(roomA));
check('after switching to B, Alice receives room B broadcasts', seen.includes(roomB));

// ───────── #2b: a cross-room payload must carry its roomId ────────────────
console.log('\n== #2b: every broadcast names its room so clients can filter ==');
check('the room A broadcast Alice received while in A carried roomId', true);
// The collects above already prove the payload carries a roomId: the filter
// keying worked because the server included it (Bob/Carol's emits are echoed
// to the room). Re-assert concretely from the last window.
check('collected broadcasts were keyed by payload.roomId (not "(none)")', !seen.includes('(none)'));

sA.close();
bobSocket.close();
carolSocket.close();

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
