import { Schema, model, Document, Types } from 'mongoose';

export type EditType = 'human_edit' | 'ai_suggestion' | 'ai_accepted' | 'ai_rejected';

export const EDIT_TYPES: EditType[] = ['human_edit', 'ai_suggestion', 'ai_accepted', 'ai_rejected'];

export interface IEditHistory extends Document {
  roomId: Types.ObjectId;
  userId: Types.ObjectId | null; // null means the AI
  type: EditType;
  summary: string;
  // Mongoose `timestamps: true` maintains createdAt/updatedAt — there is no
  // `timestamp` field. Referencing one reads `undefined` and crashes callers.
  createdAt: Date;
  updatedAt: Date;
}

const editHistorySchema = new Schema<IEditHistory>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // The enum key must be quoted — `type` collides with Mongoose's schema-type key.
    type: { type: String, enum: EDIT_TYPES, required: true },
    summary: { type: String, required: true },
  },
  { timestamps: true }
);

// Sort by createdAt — the field that actually exists. Indexing `timestamp`
// built a dead index on a nonexistent field, so the sort could not use it.
editHistorySchema.index({ roomId: 1, createdAt: -1 });

export const EditHistory = model<IEditHistory>('EditHistory', editHistorySchema);
