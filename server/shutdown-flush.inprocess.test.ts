// In-process test of the graceful-shutdown flush (#4), run with tsx:
//   npx tsx src/shutdown-flush.inprocess.test.ts
//
// On Windows a programmatic kill('SIGINT') force-terminates the child without
// ever running our signal handlers, so an end-to-end signal test cannot
// exercise the flush. This instead drives a GENUINE live room â€” through the
// real registerSocketHandlers â€” and invokes the exact flushAllRooms() that
// index.ts awaits on shutdown, then reads Mongo back to prove the live room
// was persisted. It also asserts the post-flush state round-trips through the
// same restore path the server uses on a cold start.

import http from 'http';
import bcrypt from 'bcrypt';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import mongoose from 'mongoose';
import * as Y from 'yjs';
import { User } from './src/models/User';
import { Room } from './src/models/Room';
import { registerSocketHandlers, flushAllRooms } from './src/sockets/socketHandlers';
import { signAccessToken } from './src/utils/jwt';
import { env } from './src/config/env';

const PORT = 5273; // a scratch port so a dev server can stay up on 5175

let failures = 0;
const check = (name: string, cond: boolean, detail?: string) => {
  console.log(`  ${cond ? 'âœ“' : 'âœ—'} ${name}${cond ? '' : `  ${detail ?? ''}`}`);
  if (!cond) failures += 1;
};

const toB64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
const fromB64 = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'base64'));

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const readPersistedDoc = async (roomId: string): Promise<string> => {
  // Hydrated (not lean()) so Mongoose casts yjsDocState to a real Buffer,
  // exactly like the server's own restore path reads it on a cold start.
  const room = await Room.findById(roomId);
  const raw = room?.yjsDocState as unknown as Buffer | null;
  if (!raw || !raw.length) return '';
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(raw));
  return doc.getText('content').toString();
};

const main = async (): Promise<void> => {
  await mongoose.connect(env.mongoUri);
  mongoose.set('strictQuery', true);

  const user = await User.create({
    email: `flush-inprocess-${Date.now()}@codesync.dev`,
    passwordHash: await bcrypt.hash('TestPass123!', 10),
    displayName: 'Flush InProcess',
  });

  const room = await Room.create({
    name: 'In-process flush room',
    ownerId: user._id,
    members: [user._id],
    isPublic: true,
    language: 'javascript',
  });
  const roomId = room._id.toString();

  const token = signAccessToken(user._id.toString(), user.tokenVersion, user.displayName);

  const httpServer = http.createServer();
  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.frontendUrl, credentials: true },
    transports: ['websocket', 'polling'],
  });
  registerSocketHandlers(io);

  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));

  // Two clients, both kept connected â€” so the last-client-disconnect
  // eviction path cannot run. Only flushAllRooms can persist this room.
  const mkClient = () =>
    ioClient(`http://127.0.0.1:${PORT}`, { transports: ['websocket'], auth: { token } });

  const a = mkClient();
  const b = mkClient();
  await new Promise<void>((res, rej) => {
    a.once('connect', res);
    a.once('connect_error', rej);
  });
  await new Promise<void>((res, rej) => {
    b.once('connect', res);
    b.once('connect_error', rej);
  });

  const join = (sock: ReturnType<typeof mkClient>) =>
    new Promise<void>((res, rej) => {
      const timer = setTimeout(() => rej(new Error('no room_state')), 8000);
      sock.once('room_state', () => {
        clearTimeout(timer);
        res();
      });
      sock.emit('join_room', { roomId, stateVector: toB64(Y.encodeStateVector(new Y.Doc())) });
    });
  await join(a);
  await join(b);
  await sleep(200);

  // A real, decodable edit.
  const editDoc = new Y.Doc();
  editDoc.getText('content').insert(0, 'live edit before shutdown\n');
  a.emit('yjs_update', { roomId, update: toB64(Y.encodeStateAsUpdate(editDoc)) });
  await sleep(400);

  // Nothing has flushed yet (interval is 30s, nobody disconnected).
  const before = await readPersistedDoc(roomId);
  console.log(`  persisted BEFORE flush: ${JSON.stringify(before)}`);
  check('the live edit is not persisted before the flush', !before.includes('live edit before shutdown'));

  // The exact call index.ts makes on SIGINT/SIGTERM.
  await flushAllRooms();

  const after = await readPersistedDoc(roomId);
  console.log(`  persisted AFTER flush:  ${JSON.stringify(after)}`);
  check('flushAllRooms persisted the live room without any disconnect', after.includes('live edit before shutdown'));

  a.close();
  b.close();
  await new Promise<void>((resolve) => httpServer.close(resolve));
  await User.deleteOne({ _id: user._id });
  await Room.deleteOne({ _id: room._id });
  await mongoose.disconnect();

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
};

void main().catch((err) => {
  console.error('test crashed:', err);
  process.exit(2);
});
