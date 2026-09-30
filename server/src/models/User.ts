import { Schema, model, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  displayName: string;
  resetTokenHash: string | null;
  resetTokenExpiry: Date | null;
  tokenVersion: number;
  createdAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: [true, 'Password hash is required'] },
    displayName: { type: String, required: [true, 'Display name is required'], trim: true },
    resetTokenHash: { type: String, default: null },
    resetTokenExpiry: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Never leak sensitive fields through res.json(user).
userSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const json = ret as unknown as Record<string, unknown>;
    json.id = json._id?.toString();
    delete json._id;
    delete json.passwordHash;
    delete json.resetTokenHash;
    delete json.resetTokenExpiry;
    delete json.tokenVersion;
    return json;
  },
});

export const User = model<IUser>('User', userSchema);
