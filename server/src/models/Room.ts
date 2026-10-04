import { Schema, model, Document, Types } from 'mongoose';

export interface IRoom extends Document {
  name: string;
  ownerId: Types.ObjectId;
  isPublic: boolean;
  /** bcrypt hash — set only for private rooms. */
  passwordHash: string | null;
  members: Types.ObjectId[];
  /** The room's default language; drives the starter snippet and Monaco. */
  language: string;
  yjsDocState: Buffer | null;
  createdAt: Date;
  updatedAt: Date;
}

const roomSchema = new Schema<IRoom>(
  {
    name: { type: String, required: [true, 'Room name is required'], trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isPublic: { type: Boolean, default: true },
    // Private rooms require a password to join manually; public rooms ignore it.
    passwordHash: { type: String, default: null, select: false },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    language: { type: String, default: 'javascript' },
    // Periodic Y.encodeStateAsUpdate snapshot so a room's content survives restarts.
    yjsDocState: { type: Buffer, default: null },
  },
  { timestamps: true }
);

export const Room = model<IRoom>('Room', roomSchema);
