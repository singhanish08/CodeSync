import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { User, type UserRole } from '../models/User';
import { Room } from '../models/Room';
import { EditHistory } from '../models/EditHistory';
import { closeRoom, deleteRoom, getLiveOccupancy } from '../sockets/socketHandlers';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import { AuthedRequest, requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';

const router = Router();

// Every admin route is authed AND role-checked. requireAuth populates
// req.user by verifying the bearer token; requireAdmin then reloads the role
// from the DB — that DB read is what makes demotions instant rather than
// lagging until the access token expires.
router.use(requireAuth);
router.use(requireAdmin);

/** Denormalises a room for the admin table. */
const toAdminRoom = async (room: {
  _id: { toString(): string };
  name: string;
  ownerId: { toString(): string };
  isPublic: boolean;
  members: Array<{ toString(): string }>;
  language?: string;
  createdAt: { toISOString(): string } | Date;
  updatedAt: { toISOString(): string } | Date;
}) => {
  const owner = await User.findById(room.ownerId)
    .lean()
    .select('displayName')
    .read('secondaryPreferred');
  return {
    _id: room._id.toString(),
    name: room.name,
    ownerId: room.ownerId.toString(),
    ownerName: owner?.displayName ?? 'Unknown',
    isPublic: room.isPublic,
    memberCount: room.members.length,
    language: room.language ?? 'javascript',
    createdAt: new Date(room.createdAt as unknown as string).toISOString(),
    updatedAt: new Date(room.updatedAt as unknown as string).toISOString(),
  };
};

/** Denormalises a user for the admin table. */
const toAdminUser = async (user: {
  _id: { toString(): string };
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: { toISOString(): string } | Date;
}) => {
  const ownedCount = await Room.countDocuments({ ownerId: user._id }).read('secondaryPreferred');
  return {
    _id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    ownedRooms: ownedCount,
    createdAt: new Date(user.createdAt as unknown as string).toISOString(),
  };
};

// ─────────────────────────────── Stats ──────────────────────────────────────

router.get(
  '/stats',
  asyncHandler(async (_req: AuthedRequest, res: Response) => {
    const live = getLiveOccupancy();
    const liveRoomIds = live.map((room) => new mongoose.Types.ObjectId(room.roomId));

    const [userCount, roomCount, activeRooms, editsToday] = await Promise.all([
      User.countDocuments().read('secondaryPreferred'),
      Room.countDocuments().read('secondaryPreferred'),
      // Count only rooms that actually still exist — the in-memory map can
      // hold a room whose doc was removed outside this process.
      Room.countDocuments({ _id: { $in: liveRoomIds } }).read('secondaryPreferred'),
      EditHistory.countDocuments({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }).read(
        'secondaryPreferred'
      ),
    ]);

    res.json({ users: userCount, rooms: roomCount, activeRooms, editsToday });
  })
);

/** Live room occupancy — the one stat the DB cannot answer. */
router.get(
  '/live-rooms',
  asyncHandler(async (_req: AuthedRequest, res: Response) => {
    const live = getLiveOccupancy();
    if (!live.length) {
      res.json({ rooms: [] });
      return;
    }
    const ids = live.map((room) => new mongoose.Types.ObjectId(room.roomId));
    const docs = await Room.find({ _id: { $in: ids } })
      .lean()
      .select('name')
      .read('secondaryPreferred');
    const names = new Map(docs.map((doc) => [doc._id.toString(), doc.name]));

    res.json({
      rooms: live
        .filter((room) => names.has(room.roomId))
        .map((room) => ({ ...room, name: names.get(room.roomId) as string })),
    });
  })
);

// ──────────────────────────── Room management ───────────────────────────────

router.get(
  '/rooms',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const search = String(req.query.search ?? '').trim();
    const visibility = String(req.query.visibility ?? 'all');
    const limit = Math.min(Number(req.query.limit ?? 25), 100);
    const skip = Math.max(Number(req.query.page ?? 0) * limit, 0);

    const query: mongoose.FilterQuery<typeof Room> = {};
    if (search) query.name = { $regex: search, $options: 'i' };
    if (visibility === 'public') query.isPublic = true;
    if (visibility === 'private') query.isPublic = false;

    const [total, rooms] = await Promise.all([
      Room.countDocuments(query).read('secondaryPreferred'),
      Room.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean().read('secondaryPreferred'),
    ]);

    res.json({ rooms: await Promise.all(rooms.map(toAdminRoom)), total });
  })
);

router.patch(
  '/rooms/:id',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const room = await Room.findById(req.params.id);
    if (!room) throw new ApiError(404, 'Room not found.');

    if (typeof req.body?.name === 'string' && req.body.name.trim()) {
      room.name = req.body.name.trim();
    }
    if (typeof req.body?.isPublic === 'boolean') {
      room.isPublic = req.body.isPublic;
      // A private room needs a password to join manually; if it has none and
      // is flipped private, it becomes unjoinable. Refuse rather than strand it.
      if (!room.isPublic && !room.passwordHash) {
        throw new ApiError(400, 'Make this room private from the room itself, where a password can be set.');
      }
    }

    await room.save();
    res.json({ room: await toAdminRoom(room) });
  })
);

/**
 * Step one of the two-step delete: kick every occupant and drop the live
 * session, keeping the persisted document. `reason` drives the client's toast.
 */
router.post(
  '/rooms/:id/close',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const room = await Room.findById(req.params.id).lean().select('_id name');
    if (!room) throw new ApiError(404, 'Room not found.');

    const reason = String(req.body?.reason ?? 'closed by an admin');
    const kicked = await closeRoom(room._id.toString(), reason);
    res.json({ kicked });
  })
);

/**
 * Step two: delete the room and its edit history. Guarded by the same
 * confirmation modal on the client; the endpoint itself stays idempotent —
 * deleting a room twice is a no-op, not an error.
 */
router.delete(
  '/rooms/:id',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const room = await Room.findById(req.params.id).lean().select('_id name');
    if (!room) throw new ApiError(404, 'Room not found.');

    const reason = String(req.body?.reason ?? 'deleted by an admin');
    await deleteRoom(room._id.toString(), reason);
    res.json({ ok: true });
  })
);

// ──────────────────────────── User management ───────────────────────────────

router.get(
  '/users',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const search = String(req.query.search ?? '').trim();
    const limit = Math.min(Number(req.query.limit ?? 25), 100);
    const skip = Math.max(Number(req.query.page ?? 0) * limit, 0);

    const query: mongoose.FilterQuery<typeof User> = {};
    if (search) {
      query.$or = [
        { displayName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const [total, users] = await Promise.all([
      User.countDocuments(query).read('secondaryPreferred'),
      User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .select('email displayName role createdAt')
        .read('secondaryPreferred'),
    ]);

    res.json({ users: await Promise.all(users.map(toAdminUser)), total });
  })
);

router.patch(
  '/users/:id',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const targetId = req.params.id;
    const target = await User.findById(targetId);
    if (!target) throw new ApiError(404, 'User not found.');

    // An admin cannot demote or delete themselves — a lone admin locking
    // themselves out would leave the panel unreachable.
    if (target._id.toString() === req.user!.id) {
      throw new ApiError(400, 'You cannot change your own admin role.');
    }

    if (req.body?.role === 'admin') {
      target.role = 'admin';
    } else if (req.body?.role === 'user') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) throw new ApiError(400, 'Cannot demote the last remaining admin.');
      target.role = 'user';
    } else {
      throw new ApiError(400, 'Role must be "admin" or "user".');
    }

    await target.save();
    res.json({ user: await toAdminUser(target) });
  })
);

/**
 * Deletes a user and cascades: their rooms (with occupants kicked live), their
 * membership in other rooms, and their edit history.
 */
router.delete(
  '/users/:id',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const targetId = req.params.id;
    if (targetId === req.user!.id) throw new ApiError(400, 'You cannot delete your own account from here.');

    const target = await User.findById(targetId).lean().select('_id');
    if (!target) throw new ApiError(404, 'User not found.');

    const adminCount = await User.countDocuments({ role: 'admin' });
    if (target.role === 'admin' && adminCount <= 1) {
      throw new ApiError(400, 'Cannot delete the last remaining admin.');
    }

    const ownedRooms = await Room.find({ ownerId: target._id }).lean().select('_id');
    for (const room of ownedRooms) {
      await deleteRoom(room._id.toString(), 'the owner was deleted');
    }

    await Room.updateMany({}, { $pull: { members: target._id } });
    await EditHistory.deleteMany({ userId: target._id });
    await User.deleteOne({ _id: target._id });

    res.json({ ok: true });
  })
);

// ─────────────────────────────── Activity ───────────────────────────────────

router.get(
  '/activity',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const limit = Math.min(Number(req.query.limit ?? 30), 100);

    const entries = await EditHistory.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .read('secondaryPreferred');

    // Resolve display names once instead of per-row.
    const userIds = [...new Set(entries.map((entry) => entry.userId?.toString()).filter(Boolean))];
    const users = await User.find({ _id: { $in: userIds } })
      .lean()
      .select('displayName')
      .read('secondaryPreferred');
    const names = new Map(users.map((user) => [user._id.toString(), user.displayName]));

    res.json({
      entries: entries.map((entry) => ({
        _id: entry._id.toString(),
        roomId: entry.roomId.toString(),
        userId: entry.userId?.toString() ?? null,
        userName: entry.userId ? (names.get(entry.userId.toString()) ?? 'Unknown') : 'AI',
        type: entry.type,
        summary: entry.summary,
        createdAt: entry.createdAt.toISOString(),
      })),
    });
  })
);

export default router;
