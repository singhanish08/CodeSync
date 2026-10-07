/**
 * Promotes an existing account to admin. Run once, out of band, from the
 * server directory:
 *
 *   npx tsx src/scripts/promoteAdmin.ts user@example.com
 *
 * Deliberately NOT an env-var auto-promote: an env list of admin emails would
 * grant admin to anyone who signs up with one of them, and a typo there is a
 * privilege escalation. Requiring a deliberate action against a real account
 * keeps the blast radius intentional. Demote the same way with --demote.
 */
import mongoose from 'mongoose';
import { env } from '../config/env';
import { User } from '../models/User';

const run = async (): Promise<void> => {
  const email = process.argv[2]?.toLowerCase().trim();
  const demote = process.argv.includes('--demote');

  if (!email || (!email.includes('@') && !demote)) {
    console.error('Usage: npx tsx src/scripts/promoteAdmin.ts <email> [--demote]');
    process.exit(1);
  }

  await mongoose.connect(env.mongoUri);

  const user = await User.findOne({ email });
  if (!user) {
    console.error(`No account found for ${email}.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const nextRole = demote ? 'user' : 'admin';
  if (user.role === nextRole) {
    console.log(`${email} is already ${nextRole}.`);
    await mongoose.disconnect();
    return;
  }

  if (demote) {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) {
      console.error('Cannot demote the last remaining admin.');
      await mongoose.disconnect();
      process.exit(1);
    }
  }

  user.role = nextRole;
  await user.save();
  console.log(`${email} is now an ${nextRole}.`);

  await mongoose.disconnect();
};

void run().catch((err) => {
  console.error('Failed:', err);
  void mongoose.disconnect().finally(() => process.exit(1));
});
