// Reconnect-while-typing sync test for the two-step Yjs sync protocol.
// Run from the client dir:  node reconnect-sync.test.mjs
//
// Unlike two-client-socket.test.mjs (which fires raw whole-doc updates), this
// harness models a REAL client peer: each side keeps one persistent Y.Doc and
// reproduces useYjsDoc's exact wire contract —
//   - on 'connect': emit join_room WITH the local doc's state vector,
//   - on 'room_state': apply the server's diff, then reply with sync_step_2
//     (encodeStateAsUpdate(local, serverSV)) when the server is behind us,
//   - on 'yjs_update': apply only if payload.roomId matches ours,
//   - local edits emit yjs_update immediately (socket.io BUFFERS these while
//     disconnected, and flushes the buffer before firing 'connect').
//
// Scenario: Alice's socket drops mid-session and she keeps typing offline.
// Those buffered updates used to be dropped forever (they beat join_room off
// the wire and the server had no room for them yet), leaving the server's
// clock behind and every later edit parked in pendingStructs. Now they must
// recover — via the pre-join queue and/or sync step 2 — and all three docs
// must converge.

import { io } from 'socket.io-client';
import * as Y from 'yjs';

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
    body: { email: `sync_${uid}_${name}@codesync.dev`, password: 'TestPass123!', displayName: name },
  });
  if (r.status !== 201) throw new Error(`signup failed for ${name}: ${r.status} ${JSON.stringify(r.data)}`);
  return { token: r.data.accessToken, name };
};

const toB64 = (bytes) => Buffer.from(bytes).toString('base64');
const fromB64 = (value) => new Uint8Array(Buffer.from(value, 'base64'));

/**
 * One editing peer. Mirrors useYjsDoc so the wire traffic is what a browser
 * would actually send.
 *
 * LEGACY=1 models the pre-fix client contract: no state vector on join, no
 * sync step 2 reply, and no cross-room filter. Used to A/B the server-side
 * pre-join queue in isolation against the old and new server.
 */
const LEGACY = process.env.LEGACY === '1';

class Peer {
  constructor({ token, roomId, label }) {
    this.label = label;
    this.roomId = roomId;
    this.doc = new Y.Doc();
    this.text = this.doc.getText('content');
    this.socket = io(HOST, { transports: ['websocket'], auth: { token }, autoConnect: false });

    // Local edits → emit. Buffered automatically by socket.io while offline.
    this.doc.on('update', (update, origin) => {
      if (origin === 'remote') return;
      this.socket.emit('yjs_update', { roomId: this.roomId, update: toB64(update) });
    });

    this.socket.on('room_state', (payload) => {
      if (typeof payload?.update === 'string' && payload.update.length) {
        try {
          Y.applyUpdate(this.doc, fromB64(payload.update), 'remote');
        } catch (err) {
          console.error(`  [${this.label}] room_state apply failed: ${err.message}`);
        }
      }
      // sync step 2 — send back whatever the server is missing from us.
      if (!LEGACY && typeof payload?.stateVector === 'string') {
        try {
          const serverSV = Y.decodeStateVector(fromB64(payload.stateVector));
          const mySV = Y.decodeStateVector(Y.encodeStateVector(this.doc));
          const behind = [...mySV].some(([client, clock]) => (serverSV.get(client) ?? 0) < clock);
          if (behind) {
            this.socket.emit('sync_step_2', {
              roomId: this.roomId,
              update: toB64(Y.encodeStateAsUpdate(this.doc, fromB64(payload.stateVector))),
            });
          }
        } catch (err) {
          console.error(`  [${this.label}] sync step 2 failed: ${err.message}`);
        }
      }
    });

    this.socket.on('yjs_update', (payload) => {
      // A pre-fix server broadcasts with no roomId at all; tolerate that so
      // LEGACY mode can exercise the old server.
      if (!LEGACY && payload?.roomId !== this.roomId) return;
      if (typeof payload.update !== 'string') return;
      try {
        Y.applyUpdate(this.doc, fromB64(payload.update), 'remote');
      } catch (err) {
        console.error(`  [${this.label}] yjs_update apply failed: ${err.message}`);
      }
    });
  }

  // useYjsDoc re-emits join_room on every 'connect', carrying its state vector.
  connect() {
    return new Promise((resolve, reject) => {
      const onConnect = () => {
        const payload = { roomId: this.roomId };
        if (!LEGACY) payload.stateVector = toB64(Y.encodeStateVector(this.doc));
        this.socket.emit('join_room', payload);
        resolve(this.socket.id);
      };
      this.socket.once('connect', onConnect);
      this.socket.once('connect_error', (e) => reject(new Error(`connect_error: ${e.message}`)));
      this.socket.connect();
    });
  }

  // Simulated keystrokes: real local edits, exactly like Monaco → y-monaco.
  type(str) {
    this.text.insert(this.text.length, str);
  }

  disconnect() {
    this.socket.disconnect();
  }
}

let failures = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  ${detail ?? ''}`}`);
  if (!cond) failures += 1;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll until every peer's document is byte-identical (or time out). */
const waitForConvergence = async (peers, timeoutMs = 8000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const texts = peers.map((p) => p.text.toString());
    if (texts.every((t) => t === texts[0])) return texts[0];
    await sleep(100);
  }
  return null;
};

// ───────────────────────────── setup ──────────────────────────────────────
console.log('\n== setup ==');
const alice = await signup('Alice');
const bob = await signup('Bob');
console.log('  signed up Alice + Bob');

const created = await api('/rooms', { body: { name: 'Reconnect sync room', isPublic: true }, token: alice.token });
const roomId = created.data.room._id;
await api(`/rooms/${roomId}/join`, { token: bob.token });
console.log(`  room ${roomId} created; Bob joined`);

// ──────────────────────── 1. both peers join ──────────────────────────────
console.log('\n== 1. both peers connect and join (sync step 1/2) ==');
const alicePeer = new Peer({ token: alice.token, roomId, label: 'Alice' });
const bobPeer = new Peer({ token: bob.token, roomId, label: 'Bob' });
await alicePeer.connect();
await bobPeer.connect();
await sleep(300);

alicePeer.type('line one\n');
bobPeer.type('line two\n');
let converged = await waitForConvergence([alicePeer, bobPeer]);
check('live edits converge before any drop', converged !== null, `Alice=${JSON.stringify(alicePeer.text.toString())} Bob=${JSON.stringify(bobPeer.text.toString())}`);
check('both directions of live sync arrived', converged?.includes('line one') && converged?.includes('line two'));

// ───── 2. THE SCENARIO: Alice drops mid-session and types OFFLINE ─────────
console.log('\n== 2. Alice disconnects and keeps typing (offline edits) ==');
const idBefore = alicePeer.socket.id;
alicePeer.disconnect();
// Wait until the socket is really in "disconnected" state so the emits below
// land in socket.io's send buffer rather than going out on the wire.
while (alicePeer.socket.connected) await sleep(20);
console.log(`  [Alice] socket down (was ${idBefore})`);

// Bob edits while Alice is offline — Alice must catch up via sync step 1.
bobPeer.type('bob while alice offline\n');

// Alice types offline. These emits are BUFFERED by socket.io-client and get
// flushed BEFORE the 'connect' event fires — the exact ordering that used to
// make the server drop them (join_room had not run yet).
alicePeer.type('alice offline A\n');
alicePeer.type('alice offline B\n');
console.log(`  [Alice] typed offline; sendBuffer = ${alicePeer.socket.sendBuffer.length} packet(s)`);

// ─────────────── 3. Alice reconnects with a brand-new socket id ───────────
console.log('\n== 3. Alice reconnects (new socket id) ==');
await alicePeer.connect();
console.log(`  [Alice] reconnected — old id ${idBefore} → new id ${alicePeer.socket.id}`);
check('reconnect produced a new socket id', alicePeer.socket.id !== idBefore);

// Give the queue flush + sync step 2 round trip time to land.
converged = await waitForConvergence([alicePeer, bobPeer], 10000);
console.log(`  converged text: ${JSON.stringify(converged)}`);
check(
  "Alice's OFFLINE edits reached Bob (no keystrokes lost)",
  bobPeer.text.toString().includes('alice offline A') && bobPeer.text.toString().includes('alice offline B'),
  `Bob=${JSON.stringify(bobPeer.text.toString())}`
);
check(
  "Bob's during-offline edit reached Alice (sync step 1 diff)",
  alicePeer.text.toString().includes('bob while alice offline'),
  `Alice=${JSON.stringify(alicePeer.text.toString())}`
);
check('both documents are byte-identical after the reconnect', converged !== null, 'docs diverged after convergence window');

// ───────────── 4. Edits AFTER the reconnect still flow both ways ───────────
console.log('\n== 4. editing after the reconnect (pendingStructs regression) ==');
alicePeer.type('alice post-reconnect\n');
bobPeer.type('bob post-reconnect\n');
converged = await waitForConvergence([alicePeer, bobPeer], 10000);
check(
  'post-reconnect edits are NOT swallowed by a parked clock gap',
  converged?.includes('alice post-reconnect') && converged?.includes('bob post-reconnect'),
  `Alice=${JSON.stringify(alicePeer.text.toString())} Bob=${JSON.stringify(bobPeer.text.toString())}`
);
check('documents identical at the end', converged !== null);

// ───────────── 5. Server-side clock sanity (state vectors agree) ───────────
const svA = Y.encodeStateVector(alicePeer.doc);
const svB = Y.encodeStateVector(bobPeer.doc);
check('client state vectors agree after recovery', Buffer.from(svA).equals(Buffer.from(svB)));

alicePeer.socket.close();
bobPeer.socket.close();

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
