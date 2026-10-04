// Two-client end-to-end socket test, including the reconnect scenario.
// Run from the client dir:  node two-client-socket.test.mjs
//
// Reproduces the reported bug: a socket that disconnects and reconnects gets
// a fresh socket id; if it never re-emits join_room, it is not in the
// Socket.io room and broadcasts reach no one.

import { io } from 'socket.io-client';
import * as Y from 'yjs';

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
  return { token: r.data.accessToken, name };
};

const connect = (token, label) =>
  new Promise((resolve) => {
    const s = io(HOST, {
      transports: ['websocket'],
      auth: { token },
    });
    s.on('connect', () => {
      console.log(`  [${label}] connected — socket id ${s.id}`);
      resolve(s);
    });
    s.on('connect_error', (e) => console.log(`  [${label}] connect_error: ${e.message}`));
  });

const joinRoom = (s, roomId, label) =>
  new Promise((resolve, reject) => {
    const done = (payload) => {
      console.log(`  [${label}] room_state received (presence: ${payload?.presence?.length ?? 0})`);
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

/** Wait for the next yjs_update, decoding it into a Y.Doc string. */
const nextUpdate = (s, label, timeoutMs = 8000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      s.off('yjs_update', onUpd);
      reject(new Error(`timeout waiting for yjs_update on ${label}`));
    }, timeoutMs);
    const onUpd = (payload) => {
      clearTimeout(timer);
      s.off('yjs_update', onUpd);
      const doc = new Y.Doc();
      Y.applyUpdate(doc, new Uint8Array(Buffer.from(payload.update, 'base64')));
      resolve(doc.getText('content').toString());
    };
    s.on('yjs_update', onUpd);
  });

const makeUpdate = (text) => {
  const doc = new Y.Doc();
  doc.getText('content').insert(0, text);
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
};

let failures = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  ${detail ?? ''}`}`);
  if (!cond) failures += 1;
};

// ───────────────────────────── setup ──────────────────────────────────────
console.log('\n== setup ==');
const alice = await signup('Alice');
const bob = await signup('Bob');
console.log('  both users signed up (and now get a refresh cookie)');

const created = await api('/rooms', { body: { name: 'E2E socket room', isPublic: true }, token: alice.token });
const roomId = created.data.room._id;
console.log(`  room created: ${roomId}`);

await api(`/rooms/${roomId}/join`, { token: bob.token });
console.log('  Bob joined the room');

// ───────────────────── 1. both connect + join ─────────────────────────────
console.log('\n== 1. both clients connect and join ==');
const sA = await connect(alice.token, 'Alice');
const sB = await connect(bob.token, 'Bob');
await joinRoom(sA, roomId, 'Alice');
await joinRoom(sB, roomId, 'Bob');

// ───────────────────── 2. live sync works before any drop ─────────────────
console.log('\n== 2. Alice edits → Bob receives ==');
sA.emit('yjs_update', { update: makeUpdate('hello from alice\n') });
const got1 = await nextUpdate(sB, 'Bob');
check('Bob received the edit before any reconnect', got1.includes('hello from alice'), `got ${JSON.stringify(got1)}`);

// ─────────────── 3. THE RECONNECT: Alice drops and comes back ─────────────
console.log('\n== 3. Alice disconnects and reconnects (new socket id) ==');
const idBefore = sA.id;
sA.disconnect();
await new Promise((r) => setTimeout(r, 800));
await new Promise((r) => {
  sA.once('connect', () => r());
  sA.connect();
});
console.log(`  [Alice] reconnected — old id ${idBefore} → new id ${sA.id}`);
check('reconnect produced a NEW socket id', sA.id !== idBefore);

// The client hook re-emits join_room on every connect. In a browser this is
// done by useYjsDoc's 'connect' listener — the harness emulates that contract.
await joinRoom(sA, roomId, 'Alice (after reconnect)');

console.log('\n== 4. Alice edits AFTER reconnect → Bob still receives ==');
sA.emit('yjs_update', { update: makeUpdate('hello again after reconnect\n') });
const got2 = await nextUpdate(sB, 'Bob');
check(
  'broadcast still reaches Bob after Alice reconnect (join_room re-emitted)',
  got2.includes('hello again after reconnect'),
  `got ${JSON.stringify(got2)}`
);

console.log('\n== 5. Bob edits → Alice (the reconnected socket) receives ==');
sB.emit('yjs_update', { update: makeUpdate('hi from bob\n') });
const got3 = await nextUpdate(sA, 'Alice');
check(
  'the reconnected socket RECEIVES broadcasts (it is in the Socket.io room)',
  got3.includes('hi from bob'),
  `got ${JSON.stringify(got3)}`
);

sA.close();
sB.close();

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
