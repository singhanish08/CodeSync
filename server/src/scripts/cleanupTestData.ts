// One-off cleanup: removes the rooms and accounts the E2E suites created in
// the dev database during verification. Deliberately pattern-matched and
// dry-run-first — it never touches anything that does not match a test
// prefix, so real data is safe.
//
// A room is considered test residue if ANY of these hold:
//   1. its NAME matches a suite's naming convention (TEST_ROOM_PATTERNS), or
//   2. its OWNER matches a throwaway account (TEST_EMAIL_PATTERNS), or
//   3. it has no owner account at all (only reachable with --orphans).
//
// Rule 2 matters on its own: matching rooms by name alone left rooms behind
// whenever a suite used a name the patterns did not anticipate, and deleting
// the users without their rooms left orphans behind.
//
//   npx tsx src/scripts/cleanupTestData.ts                     (dry run, lists only)
//   npx tsx src/scripts/cleanupTestData.ts --apply             (actually deletes)
//   npx tsx src/scripts/cleanupTestData.ts --apply --orphans   (also delete ownerless rooms)

import mongoose from 'mongoose';
import { env } from '../config/env';

const TEST_ROOM_PATTERNS = [
  // Unanchored: suites prefix the marker ("Lang E2E …", "Ghost E2E …",
  // "AI E2E …") as well as leading with it.
  /E2E /,
  /^Cursor room [AB]$/,
  /^Python room$/,
  /^Default room$/,
  /^Bogus create$/,
  /^Reconnect room/,
  // reconnect-sync.test.mjs names it "Reconnect sync room", which /^Reconnect
  // room/ does not match.
  /^Reconnect sync room$/,
  /^Room [AB]$/,
  // The manual two-browser verification of the language-switch fix — one room
  // per branch: an edited sample (prompt -> Replace), real code (no prompt),
  // and an edited sample kept as-is (prompt -> Keep).
  /^Live (edited|code|keep) [a-z0-9]+$/i,
];

const TEST_EMAIL_PATTERNS = [
  /^e2e_[a-z0-9]+_/i,
  /^admin_[a-z0-9]+_/i,
  /^browser_[a-z0-9]+@codesync\.dev$/i,
  /^plain_[a-z0-9]+@codesync\.dev$/i,
  /@codesync\.dev$/i, // every suite mints throwaway accounts on this domain
];

// The driver returns untyped documents (find() -> WithId<AnyObject>,
// aggregate() -> Document), so normalise them to the two fields this script
// reads instead of leaking three different result types through the helpers.
type RoomRow = { _id: unknown; name?: unknown };

const toRows = (docs: readonly unknown[]): RoomRow[] => docs.map((doc) => doc as RoomRow);

const listRooms = (label: string, rooms: readonly RoomRow[]): void => {
  console.log(`\n${label} (${rooms.length}):`);
  rooms.forEach((room) => console.log(`  ${room._id}  ${room.name}`));
};

const run = async (): Promise<void> => {
  await mongoose.connect(env.mongoUri);
  const Room = mongoose.connection.collection('rooms');
  const User = mongoose.connection.collection('users');
  const EditHistory = mongoose.connection.collection('edithistories');
  const apply = process.argv.includes('--apply');
  const sweepOrphans = process.argv.includes('--orphans');

  const users = await User.find({ email: { $in: TEST_EMAIL_PATTERNS } }).toArray();
  const userIds = users.map((user) => user._id);

  const [byNameDocs, byOwnerDocs, orphanDocs] = await Promise.all([
    Room.find({ name: { $in: TEST_ROOM_PATTERNS } }).toArray(),
    Room.find({ ownerId: { $in: userIds } }).toArray(),
    // Rooms whose owner is absent from the users collection — either a suite
    // account deleted by a previous run, or an account removed by an admin
    // action that does not cascade to rooms.
    Room.aggregate([
      { $lookup: { from: 'users', localField: 'ownerId', foreignField: '_id', as: 'owner' } },
      { $match: { owner: { $size: 0 } } },
      { $project: { name: 1, ownerId: 1 } },
    ]).toArray(),
  ]);

  const byName = toRows(byNameDocs);
  const byOwner = toRows(byOwnerDocs);
  const orphans = toRows(orphanDocs);

  const roomIds: mongoose.Types.ObjectId[] = [];
  const seen = new Set<string>();
  const addRooms = (batch: readonly RoomRow[]): void => {
    for (const room of batch) {
      const key = String(room._id);
      if (seen.has(key)) continue;
      seen.add(key);
      roomIds.push(room._id as mongoose.Types.ObjectId);
    }
  };

  addRooms(byName);
  addRooms(byOwner);
  if (sweepOrphans) addRooms(orphans);

  listRooms('Test rooms by name pattern', byName);
  listRooms('Rooms owned by a test account', byOwner);
  listRooms('Rooms with no owner account', orphans);
  if (orphans.length > 0) {
    console.log(
      sweepOrphans
        ? '  (selected for deletion by --orphans)'
        : '  (SKIPPED — re-run with --orphans to delete these)',
    );
  }

  console.log(`\nTest users matching (${users.length}):`);
  users.forEach((user) => console.log(`  ${user._id}  ${user.email}  (role: ${user.role ?? 'user'})`));

  const editCount = await EditHistory.countDocuments({ roomId: { $in: roomIds } });
  console.log(`\nRooms selected for deletion: ${roomIds.length}`);
  console.log(`Edit-history rows tied to those rooms: ${editCount}`);

  if (!apply) {
    console.log('\nDRY RUN — nothing deleted. Re-run with --apply to delete.');
  } else {
    await EditHistory.deleteMany({ roomId: { $in: roomIds } });
    await Room.deleteMany({ _id: { $in: roomIds } });
    await User.deleteMany({ _id: { $in: userIds } });
    console.log(
      `\nDeleted ${roomIds.length} room(s), ${editCount} edit-history row(s), ${userIds.length} user(s).`,
    );
  }

  await mongoose.disconnect();
};

void run().catch((err) => {
  console.error('Cleanup failed:', err);
  void mongoose.disconnect().finally(() => process.exit(1));
});
