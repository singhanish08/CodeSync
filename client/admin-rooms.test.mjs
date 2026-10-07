// Admin room-management test — including the occupied-room deletion case.
// Run from the client dir against a throwaway server:
//   $env:CODESYNC_HOST='http://127.0.0.1:5180'; node admin-rooms.test.mjs
//
// The load-bearing scenario is step 2: an admin deletes a room that TWO real
// socket sessions are actively editing. Without the tombstone-ordered teardown
// (emit room_closed -> disconnect sockets -> clear in-memory state -> delete
// docs) a client would either keep editing a ghost room or get a hard
// disconnect with no explanation.

import { io } from 'socket.io-client';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = process.env.CODESYNC_HOST || 'http://127.0.0.1:5175';
const API = `${HOST}/api`;

// The throwaway server connects with the string from server/.env, so this
// test must read the SAME file — pointing at a local mongo would promote a
// user in a database the server never looks at. Loaded at runtime only; the
// value is never written into this file or committed.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', 'server', '.env') });
const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) throw new Error('MONGODB_URI missing — server/.env could not be read.');

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
    body: { email: `admin_${uid}_${name}@codesync.dev`, password: 'TestPass123!', displayName: name },
  });
  if (r.status !== 201) throw new Error(`signup failed for ${name}: ${r.status} ${JSON.stringify(r.data)}`);
  return { token: r.data.accessToken, id: r.data.user.id, name };
};

const connect = (token, label) =>
  new Promise((resolve, reject) => {
    const s = io(HOST, { transports: ['websocket'], auth: { token } });
    const timer = setTimeout(() => {
      s.close();
      reject(new Error(`timeout connecting ${label}`));
    }, 8000);
    s.on('connect', () => {
      clearTimeout(timer);
      console.log(`  [${label}] connected — socket id ${s.id}`);
      resolve(s);
    });
    s.on('connect_error', (e) => console.log(`  [${label}] connect_error: ${e.message}`));
  });

const joinRoom = (s, roomId, label) =>
  new Promise((resolve, reject) => {
    const done = (payload) => {
      clearTimeout(timer);
      s.off('error', onError);
      console.log(`  [${label}] joined room (${payload?.presence?.length ?? 0} present)`);
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

/** Resolves when the socket sees `room_closed`, capturing the payload. */
const waitForRoomClosed = (s, label, timeoutMs = 6000) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      s.off('room_closed', onClosed);
      resolve(null);
    }, timeoutMs);
    const onClosed = (payload) => {
      clearTimeout(timer);
      s.off('room_closed', onClosed);
      console.log(`  [${label}] room_closed received: ${JSON.stringify(payload)}`);
      resolve(payload);
    };
    s.on('room_closed', onClosed);
  });

let failures = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  ${detail ?? ''}`}`);
  if (!cond) failures += 1;
};

// ───────────────────────────── setup ──────────────────────────────────────
console.log('\n== setup ==');
const admin = await signup('Admin');
const alice = await signup('Alice');
const bob = await signup('Bob');
console.log('  three users signed up');

// Promote Admin out of band — the client offers no self-service path by design.
await mongoose.connect(MONGO_URI);
const User = mongoose.connection.collection('users');
await User.updateOne({ _id: new mongoose.Types.ObjectId(admin.id) }, { $set: { role: 'admin' } });
console.log(`  ${admin.name} promoted to admin (direct DB write)`);
admin.token = (await api('/auth/login', {
  method: 'POST',
  body: { email: `admin_${uid}_Admin@codesync.dev`, password: 'TestPass123!' },
})).data.accessToken;
console.log('  admin re-logged in so the fresh token carries role: admin');

// ─────────────── 1. non-admin is locked out of every admin route ──────────
console.log('\n== 1. role gate ==');
const statsDeny = await api('/admin/stats', { method: 'GET', token: alice.token });
check('non-admin GET /admin/stats is 403', statsDeny.status === 403, `got ${statsDeny.status}`);

const statsAllow = await api('/admin/stats', { method: 'GET', token: admin.token });
check('admin GET /admin/stats is 200', statsAllow.status === 200, `got ${statsAllow.status}`);
check('stats shape', typeof statsAllow.data.users === 'number' && typeof statsAllow.data.rooms === 'number', JSON.stringify(statsAllow.data));

// ───────────────── 2. THE OCCUPIED-ROOM DELETION ─────────────────────────
console.log('\n== 2. admin deletes a room two clients are editing ==');
const created = await api('/rooms', { body: { name: 'E2E admin-target room', isPublic: true }, token: alice.token });
const liveRoomId = created.data.room._id;
console.log(`  room created: ${liveRoomId}`);

await api(`/rooms/${liveRoomId}/join`, { token: bob.token });

const sA = await connect(alice.token, 'Alice');
const sB = await connect(bob.token, 'Bob');
await joinRoom(sA, liveRoomId, 'Alice');
await joinRoom(sB, liveRoomId, 'Bob');

// Both sockets are actively in the room — this is what makes the deletion
// "occupied". The presence count proves the server sees them.
const presence = await api(`/rooms/${liveRoomId}`, { method: 'GET', token: alice.token });
check('room exists and both are members before deletion', presence.status === 200 && presence.data.room.members.length >= 2, JSON.stringify(presence.data.room?.members));

// Arm the listeners BEFORE the delete so we cannot miss the broadcast.
const closedA = waitForRoomClosed(sA, 'Alice');
const closedB = waitForRoomClosed(sB, 'Bob');

const del = await api(`/admin/rooms/${liveRoomId}`, { method: 'DELETE', token: admin.token });
check('admin DELETE /admin/rooms/:id is 200', del.status === 200, `got ${del.status} ${JSON.stringify(del.data)}`);

const [payloadA, payloadB] = await Promise.all([closedA, closedB]);
check('Alice received room_closed', payloadA !== null, 'no room_closed event within timeout');
check('Bob received room_closed', payloadB !== null, 'no room_closed event within timeout');
check('room_closed named the room', payloadA?.roomId === liveRoomId, JSON.stringify(payloadA));
check('room_closed carried a reason', typeof payloadA?.reason === 'string' && payloadA.reason.length > 0, JSON.stringify(payloadA));

// Give the server a beat to tear the transports down.
await new Promise((r) => setTimeout(r, 700));
check('Alice socket is disconnected', sA.connected === false, `connected=${sA.connected}`);
check('Bob socket is disconnected', sB.connected === false, `connected=${sB.connected}`);

// The document must be gone, and a rejoin must be refused rather than
// silently resurrecting an in-memory room for a deleted doc.
const after = await api(`/rooms/${liveRoomId}`, { method: 'GET', token: alice.token });
check('room is gone from the DB', after.status === 404, `got ${after.status}`);

const Room = mongoose.connection.collection('rooms');
const docCount = await Room.countDocuments({ _id: new mongoose.Types.ObjectId(liveRoomId) });
check('no room document remains', docCount === 0, `count=${docCount}`);

const EditHistory = mongoose.connection.collection('edithistories');
const editCount = await EditHistory.countDocuments({ roomId: new mongoose.Types.ObjectId(liveRoomId) });
check('edit history was cascade-deleted', editCount === 0, `count=${editCount}`);

// ───────────── 3. close-then-delete on an EMPTY room stays valid ──────────
console.log('\n== 3. plain close on an empty room ==');
const empty = await api('/rooms', { body: { name: 'E2E empty room', isPublic: true }, token: alice.token });
const emptyId = empty.data.room._id;

const closeRes = await api(`/admin/rooms/${emptyId}/close`, { method: 'POST', token: admin.token, body: { reason: 'testing close' } });
check('POST /admin/rooms/:id/close is 200', closeRes.status === 200, `got ${closeRes.status}`);
check('close reports 0 kicked on an empty room', closeRes.data.kicked === 0, JSON.stringify(closeRes.data));

// The document must STILL exist — close kicks, it does not delete.
const stillThere = await api(`/rooms/${emptyId}`, { method: 'GET', token: alice.token });
check('close kept the document', stillThere.status === 200, `got ${stillThere.status}`);

// ─────────────────────── 4. admin self-guards ─────────────────────────────
console.log('\n== 4. self-guards ==');
const selfPatch = await api(`/admin/users/${admin.id}`, { method: 'PATCH', token: admin.token, body: { role: 'user' } });
check('admin cannot demote themselves', selfPatch.status === 400, `got ${selfPatch.status} ${JSON.stringify(selfPatch.data)}`);

const selfDelete = await api(`/admin/users/${admin.id}`, { method: 'DELETE', token: admin.token });
check('admin cannot delete themselves', selfDelete.status === 400, `got ${selfDelete.status} ${JSON.stringify(selfDelete.data)}`);

const promote = await api(`/admin/users/${alice.id}`, { method: 'PATCH', token: admin.token, body: { role: 'admin' } });
check('admin can promote another user', promote.status === 200 && promote.data.user.role === 'admin', `got ${promote.status} ${JSON.stringify(promote.data)}`);

// Now Alice is an admin too, so demoting the ORIGINAL admin is still safe —
// there is more than one admin left.
const demoteOriginal = await api(`/admin/users/${admin.id}`, { method: 'PATCH', token: alice.token, body: { role: 'user' } });
check('second admin can demote the first (not the last admin)', demoteOriginal.status === 200, `got ${demoteOriginal.status} ${JSON.stringify(demoteOriginal.data)}`);

// Demoting the LAST remaining admin must be refused.
const demoteLast = await api(`/admin/users/${alice.id}`, { method: 'PATCH', token: alice.token, body: { role: 'user' } });
check('cannot demote the last remaining admin', demoteLast.status === 400, `got ${demoteLast.status} ${JSON.stringify(demoteLast.data)}`);

// ───────────────────────────── teardown ───────────────────────────────────
await User.deleteMany({ email: { $regex: `^admin_${uid}_` } });
await Room.deleteMany({ name: { $in: ['E2E admin-target room', 'E2E empty room'] } });
await mongoose.disconnect();
sA.close();
sB.close();

console.log(`\n${failures === 0 ? '✅ ALL ADMIN CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
