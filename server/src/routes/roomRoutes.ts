import { Router, Response } from 'express';
import { Types } from 'mongoose';
import bcrypt from 'bcrypt';
import { Room } from '../models/Room';
import { EditHistory } from '../models/EditHistory';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import { AuthedRequest, requireAuth } from '../middleware/requireAuth';

const router = Router();

// Every room route requires a valid access token.
router.use(requireAuth);

// Reject malformed ids up front so a garbage `:id` yields a clean 404 instead
// of a Mongoose CastError leaking as a 500.
router.param('id', (req, _res, next) => {
  if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
    next(new ApiError(404, 'Room not found.'));
    return;
  }
  next();
});

/** Structural input type accepted by the DTO helpers — works for both hydrated
 * Mongoose documents and `lean()` plain objects (whose mongoose-internal
 * `collection` typing differs). */
type AnyRoom = {
  _id: { toString(): string };
  name: string;
  ownerId: { toString(): string };
  isPublic: boolean;
  members: Array<{ toString(): string }>;
  createdAt: { toISOString(): string } | Date;
  updatedAt: { toISOString(): string } | Date;
};

const toRoomDTO = (room: AnyRoom) => ({
  _id: room._id.toString(),
  name: room.name,
  ownerId: room.ownerId.toString(),
  isPublic: room.isPublic,
  members: room.members.map((member) => member.toString()),
  createdAt: new Date(room.createdAt as unknown as string).toISOString(),
  updatedAt: new Date(room.updatedAt as unknown as string).toISOString(),
});

/** Membership gate: the owner or an accepted member. The ONLY ways in are
 * being the owner, or having gone through the Join Room flow (Room ID, plus
 * the room's password when it is private). */
const isMember = (room: AnyRoom, userId: string): boolean =>
  room.ownerId.toString() === userId || room.members.some((member) => member.toString() === userId);

// ─────────────────────────────── Routes ────────────────────────────────────

router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const userId = new Types.ObjectId(req.user!.id);
    const rooms = await Room.find({ $or: [{ ownerId: userId }, { members: userId }] })
      .sort({ updatedAt: -1 })
      .lean();
    res.json({ rooms: rooms.map(toRoomDTO) });
  })
);

router.post(
  '/',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) throw new ApiError(400, 'Room name is required.');
    if (name.length > 80) throw new ApiError(400, 'Room name must be 80 characters or fewer.');

    const isPublic = Boolean(req.body?.isPublic ?? true);
    const ownerId = new Types.ObjectId(req.user!.id);

    // A private room needs a password to join manually; public rooms never do.
    let passwordHash: string | null = null;
    if (!isPublic) {
      const password = String(req.body?.password ?? '');
      if (password.length < 4) throw new ApiError(400, 'Private rooms need a password of at least 4 characters.');
      passwordHash = await bcrypt.hash(password, 10);
    }

    const room = await Room.create({
      name,
      ownerId,
      isPublic,
      passwordHash,
      members: [ownerId],
    });

    res.status(201).json({ room: toRoomDTO(room) });
  })
);

/**
 * Room metadata. Membership-gated: opening a room you have not joined (even a
 * public one) must NOT grant access — the client sends the user to the Join
 * Room modal instead. A 403 here is how the client knows to do that.
 */
router.get(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const room = await Room.findById(req.params.id).lean();
    if (!room) throw new ApiError(404, 'Room not found.');
    if (!isMember(room, req.user!.id)) throw new ApiError(403, 'You need to join this room first.');

    res.json({ room: toRoomDTO(room) });
  })
);

/**
 * Lightweight visibility probe used by the "Join room" dialog to decide
 * whether to show the password field. Deliberately leaks nothing beyond
 * `{ isPublic }` — no name, no members, no content.
 */
router.get(
  '/:id/visibility',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const room = await Room.findById(req.params.id).lean().select('isPublic');
    if (!room) throw new ApiError(404, 'Room not found.');

    res.json({ isPublic: room.isPublic });
  })
);

/**
 * Manual join by Room ID + password — the ONLY way into a room you do not own.
 * - Public rooms: never require a password.
 * - Private rooms: require the password unless the caller is already the
 *   owner or a member (so re-joining is seamless).
 */
router.post(
  '/:id/join',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    // `passwordHash` is `select: false` — pull it explicitly.
    const room = await Room.findById(req.params.id).select('+passwordHash');
    if (!room) throw new ApiError(404, 'Room not found.');

    if (!isMember(room, req.user!.id)) {
      if (room.isPublic) {
        // Public rooms are open to everyone — no password check, ever.
      } else if (!room.passwordHash) {
        // Legacy private room without a password: treat as open but keep it private.
      } else {
        const password = String(req.body?.password ?? '');
        const match = await bcrypt.compare(password, room.passwordHash);
        if (!match) throw new ApiError(401, 'Wrong password for this room.');
      }
    }

    const userId = new Types.ObjectId(req.user!.id);
    if (!room.members.some((member) => member.toString() === req.user!.id)) {
      room.members.push(userId);
      await room.save();
    }

    res.json({ room: toRoomDTO(room) });
  })
);

// Rename a room. Owners only — members get a read-only name in the editor.
// Additive: the editor's inline title needs a persistence path, and this is it.
router.put(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) throw new ApiError(400, 'Room name is required.');
    if (name.length > 80) throw new ApiError(400, 'Room name must be 80 characters or fewer.');

    const room = await Room.findById(req.params.id);
    if (!room) throw new ApiError(404, 'Room not found.');
    if (room.ownerId.toString() !== req.user!.id) throw new ApiError(403, 'Only the owner can rename this room.');

    const previousName = room.name;
    if (previousName !== name) {
      room.name = name;
      await room.save();
      await EditHistory.create({
        roomId: room._id,
        userId: new Types.ObjectId(req.user!.id),
        type: 'human_edit',
        summary: `Renamed the room from “${previousName}” to “${name}”.`,
      });
    }

    res.json({ room: toRoomDTO(room) });
  })
);

router.get(
  '/:id/history',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const room = await Room.findById(req.params.id).lean();
    if (!room) throw new ApiError(404, 'Room not found.');
    if (!isMember(room, req.user!.id)) throw new ApiError(403, 'You need to join this room first.');

    const history = await EditHistory.find({ roomId: room._id })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();

    res.json({
      history: history.map((h) => ({
        _id: h._id.toString(),
        roomId: h.roomId.toString(),
        userId: h.userId ? h.userId.toString() : null,
        type: h.type,
        summary: h.summary,
        timestamp: h.timestamp.toISOString(),
      })),
    });
  })
);

export default router;
