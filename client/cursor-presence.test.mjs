// Remote-cursor presence test (Issue 2, server half).
// Run from the client dir:  node cursor-presence.test.mjs
//
// y-monaco paints each remote selection/caret from that user's awareness state
// (`user.name` + `user.color` + `selection`). Awareness is only broadcast on
// CHANGE, so a client that joins an occupied room used to see nobody's cursor
// until someone happened to move. The server now replays every live awareness
// state to a joining socket. This test drives the real socket contract:
//
//   1. Alice joins alone and publishes her awareness (name + colour).
//   2. Bob joins after her — he must see Alice immediately, with no further
//      movement from Alice.
//   3. Two remotes (Alice + Carol) are both visible to a third joiner, each
//      under their own name and colour.
//   4. A later real cursor move still reaches everyone (no regression).
//   5. Awareness does not leak across rooms.

import { io } from 'socket.io-client';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';

const HOST = 'http://127.0.0.1:5180';
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
    body: { email: `cur_${uid}_${name}@codesync.dev`, password: 'TestPass123!', displayName: name },
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

/** Every awareness_update received, with its raw payload. */
const collectAwareness = (socket, durationMs) =>
  new Promise((resolve) => {
    const seen = [];
    const handler = (payload) => {
      if (typeof payload?.update === 'string') seen.push(payload);
    };
    socket.on('awareness_update', handler);
    setTimeout(() => {
      socket.off('awareness_update', handler);
      resolve(seen);
    }, durationMs);
  });

/** Encode one user's awareness exactly the way useYjsDoc does. */
const publishPresence = (socket, roomId, doc, fields) => {
  const aw = new awarenessProtocol.Awareness(doc);
  aw.setLocalStateField('user', fields);
  const update = Buffer.from(awarenessProtocol.encodeAwarenessUpdate(aw, [doc.clientID])).toString('base64');
  socket.emit('awareness_update', { roomId, update });
};

/** Decode a batch of base64 updates into clientID -> state. */
const decodeStates = (updates) => {
  const doc = new Y.Doc();
  const aw = new awarenessProtocol.Awareness(doc);
  for (const b64 of updates) {
    try {
      awarenessProtocol.applyAwarenessUpdate(aw, new Uint8Array(Buffer.from(b64, 'base64')), 'remote');
    } catch {
      /* a malformed entry must not sink the rest */
    }
  }
  return new Map([...aw.getStates()].map(([id, state]) => [id, state]));
};

/** All user states found in the collected payloads. */
const userStatesFrom = (payloads) => {
  const merged = decodeStates(payloads.map((p) => p.update));
  return [...merged.values()]
    .map((state) => state?.user)
    .filter((user) => user && typeof user === 'object');
};

const namesFrom = (payloads) => userStatesFrom(payloads).map((user) => user.name).sort();

// ───────────────────── setup ─────────────────────────────────────────────
console.log('\n== setup ==');
const alice = await signup('Alice');
const bob = await signup('Bob');
const carol = await signup('Carol');
const dave = await signup('Dave');

const roomA = (await api('/rooms', { body: { name: 'Cursor room A', isPublic: true }, token: alice.token })).data.room._id;
const roomB = (await api('/rooms', { body: { name: 'Cursor room B', isPublic: true }, token: alice.token })).data.room._id;
await api(`/rooms/${roomA}/join`, { token: bob.token });
await api(`/rooms/${roomA}/join`, { token: carol.token });
await api(`/rooms/${roomB}/join`, { token: dave.token });
console.log(`  room A ${roomA}, room B ${roomB}`);

const connect = async (token) => {
  const socket = io(HOST, { transports: ['websocket'], auth: { token } });
  await once(socket, 'connect');
  return socket;
};

// ─── 1+2: a late joiner sees an already-present collaborator immediately ──
console.log('\n== a late joiner sees existing cursors with no extra movement ==');
{
  const sAlice = await connect(alice.token);
  sAlice.emit('join_room', { roomId: roomA });
  await once(sAlice, 'room_state');

  // Alice publishes her presence, then STOPS — she will not move again.
  const aliceDoc = new Y.Doc();
  publishPresence(sAlice, roomA, aliceDoc, { name: 'Alice', color: '#e11d48' });
  await sleep(400);

  const sBob = await connect(bob.token);
  sBob.emit('join_room', { roomId: roomA });
  await once(sBob, 'room_state');

  const received = await collectAwareness(sBob, 1500);
  const names = namesFrom(received);
  console.log(`  [Bob on join] saw user names: ${JSON.stringify(names)}`);
  check('Bob sees Alice without Alice moving again', names.includes('Alice'));
  check("Bob sees Alice's colour", userStatesFrom(received).some((u) => u.name === 'Alice' && u.color === '#e11d48'));

  // ─── 4: a later real move still reaches Bob (no regression in the broadcast path)
  console.log('  -- Alice moves her cursor for real --');
  const later = collectAwareness(sBob, 1200);
  publishPresence(sAlice, roomA, aliceDoc, { name: 'Alice', color: '#e11d48' });
  const laterSeen = namesFrom(await later);
  console.log(`  [Bob after move] saw user names: ${JSON.stringify(laterSeen)}`);
  check('a real cursor move is still broadcast', laterSeen.includes('Alice'));

  sAlice.close();
  sBob.close();
}

// ─── 3: two remote users are BOTH visible to a third joiner ───────────────
console.log('\n== two remote users are both visible to a third joiner ==');
{
  const sAlice = await connect(alice.token);
  sAlice.emit('join_room', { roomId: roomA });
  await once(sAlice, 'room_state');
  const sCarol = await connect(carol.token);
  sCarol.emit('join_room', { roomId: roomA });
  await once(sCarol, 'room_state');

  const aliceDoc = new Y.Doc();
  const carolDoc = new Y.Doc();
  publishPresence(sAlice, roomA, aliceDoc, { name: 'Alice', color: '#e11d48' });
  publishPresence(sCarol, roomA, carolDoc, { name: 'Carol', color: '#2563eb' });
  await sleep(400);

  const sBob = await connect(bob.token);
  sBob.emit('join_room', { roomId: roomA });
  await once(sBob, 'room_state');
  const received = await collectAwareness(sBob, 1500);
  const names = namesFrom(received);
  console.log(`  [Bob on join] saw user names: ${JSON.stringify(names)}`);
  check('Bob sees BOTH Alice and Carol', names.includes('Alice') && names.includes('Carol'));

  // Each name must carry its OWN colour — the distinct-color requirement.
  const users = userStatesFrom(received);
  const aliceColor = users.find((u) => u.name === 'Alice')?.color;
  const carolColor = users.find((u) => u.name === 'Carol')?.color;
  check('Alice and Carol keep distinct colours', aliceColor === '#e11d48' && carolColor === '#2563eb');

  // And the two come from different Yjs client ids (two distinct awareness entries).
  const states = decodeStates(received.map((p) => p.update));
  check('two separate awareness states exist', states.size >= 2);

  sAlice.close();
  sCarol.close();
  sBob.close();
}

// ─── 5: awareness must not leak into a different room ─────────────────────
console.log('\n== awareness stays inside its own room ==');
{
  const sAlice = await connect(alice.token);
  sAlice.emit('join_room', { roomId: roomA });
  await once(sAlice, 'room_state');
  const aliceDoc = new Y.Doc();
  publishPresence(sAlice, roomA, aliceDoc, { name: 'Alice', color: '#e11d48' });
  await sleep(300);

  const sDave = await connect(dave.token);
  sDave.emit('join_room', { roomId: roomB });
  await once(sDave, 'room_state');
  const received = await collectAwareness(sDave, 1200);
  const names = namesFrom(received);
  console.log(`  [Dave in room B] saw user names: ${JSON.stringify(names)}`);
  check('Dave in room B does not see room A awareness', !names.includes('Alice'));

  sAlice.close();
  sDave.close();
}

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECKS FAILED\n`);
process.exit(failures > 0 ? 1 : 0);
