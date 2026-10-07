import { Router, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { User, IUser } from '../models/User';
import { env } from '../config/env';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/apiError';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt';
import { AuthedRequest } from '../middleware/requireAuth';
import { sendPasswordResetEmail } from '../services/emailService';

const router = Router();

const REFRESH_COOKIE = 'refreshToken';
const RESET_TOKEN_EXPIRY_MS = 15 * 60 * 1000;
const REMEMBER_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Refresh cookie flags. `Secure` + `SameSite=None` are required in production
 * where the Vercel frontend and Render backend live on different domains.
 * In development (plain HTTP, same-site localhost) we use Lax + non-secure so
 * the browser actually accepts and re-sends the cookie.
 */
const refreshCookieOptions = (rememberMe: boolean) => ({
  httpOnly: true,
  sameSite: env.isProduction ? ('none' as const) : ('lax' as const),
  secure: env.isProduction,
  ...(rememberMe ? { maxAge: REMEMBER_COOKIE_MAX_AGE_MS } : {}),
});

const publicUser = (user: IUser) => ({
  id: user._id.toString(),
  email: user.email,
  displayName: user.displayName,
  role: user.role,
});

// ─────────────────────────── Validation helpers ───────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateSignup = (body: unknown) => {
  const b = (body ?? {}) as Record<string, string>;
  const errors: string[] = [];
  if (!b.displayName || !b.displayName.trim()) errors.push('Display name is required.');
  if (!b.email || !EMAIL_RE.test(String(b.email))) errors.push('A valid email is required.');
  if (!b.password || String(b.password).length < 8) errors.push('Password must be at least 8 characters.');
  return errors;
};

const validateLogin = (body: unknown) => {
  const b = (body ?? {}) as Record<string, string>;
  const errors: string[] = [];
  if (!b.email || !EMAIL_RE.test(String(b.email))) errors.push('A valid email is required.');
  if (!b.password) errors.push('Password is required.');
  return errors;
};

// ─────────────────────────────── Routes ────────────────────────────────────

router.post(
  '/signup',
  asyncHandler(async (req, res: Response) => {
    const errors = validateSignup(req.body);
    if (errors.length) throw new ApiError(400, errors.join(' '));

    const email = String(req.body.email).toLowerCase().trim();
    const displayName = String(req.body.displayName).trim();

    const existing = await User.findOne({ email }).lean();
    if (existing) throw new ApiError(409, 'An account with that email already exists.');

    const passwordHash = await bcrypt.hash(String(req.body.password), 10);
    const user = await User.create({ email, passwordHash, displayName });

    const accessToken = signAccessToken(user._id.toString(), user.tokenVersion, user.displayName, user.role);
    // Establish the same persistent session login does — without this the new
    // user has no refresh cookie, so their very next /auth/refresh 401s and
    // the client tears the session down.
    const refreshToken = signRefreshToken(user._id.toString(), user.tokenVersion, false);
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(false));
    res.status(201).json({ accessToken, user: publicUser(user) });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res: Response) => {
    const errors = validateLogin(req.body);
    if (errors.length) throw new ApiError(400, errors.join(' '));

    const email = String(req.body.email).toLowerCase().trim();
    const rememberMe = Boolean(req.body.rememberMe);

    const user = await User.findOne({ email });
    if (!user) throw new ApiError(401, 'Invalid email or password.');

    const match = await bcrypt.compare(String(req.body.password), user.passwordHash);
    if (!match) throw new ApiError(401, 'Invalid email or password.');

    const accessToken = signAccessToken(user._id.toString(), user.tokenVersion, user.displayName, user.role);
    const refreshToken = signRefreshToken(user._id.toString(), user.tokenVersion, rememberMe);

    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(rememberMe));
    res.json({ accessToken, user: publicUser(user) });
  })
);

router.post(
  '/refresh',
  asyncHandler(async (req, res: Response) => {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) throw new ApiError(401, 'No refresh token provided.');

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(false));
      throw new ApiError(401, 'Invalid refresh token. Please log in again.');
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(false));
      throw new ApiError(401, 'Account no longer exists.');
    }

    // Bumping tokenVersion on password reset invalidates older refresh tokens.
    if (user.tokenVersion !== decoded.tokenVersion) {
      res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(false));
      throw new ApiError(401, 'Session expired. Please log in again.');
    }

    const accessToken = signAccessToken(user._id.toString(), user.tokenVersion, user.displayName, user.role);
    res.json({ accessToken, user: publicUser(user) });
  })
);

router.post('/logout', (_req, res: Response) => {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(false));
  res.json({ message: 'Logged out successfully.' });
});

router.post(
  '/forgot-password',
  asyncHandler(async (req, res: Response) => {
    const email = String((req.body ?? {}).email ?? '').toLowerCase().trim();

    // Always respond with the same generic message to prevent email enumeration.
    const GENERIC = { message: 'If an account with that email exists, a password reset link has been sent.' };

    if (!email || !EMAIL_RE.test(email)) throw new ApiError(400, 'A valid email is required.');

    const user = await User.findOne({ email });
    if (user) {
      try {
        const rawToken = crypto.randomBytes(32).toString('hex');
        user.resetTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        user.resetTokenExpiry = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);
        await user.save();

        await sendPasswordResetEmail(user.email, rawToken);
      } catch (err) {
        // Never reveal whether the account exists; log the real cause server-side.
        console.error('[forgot-password] Failed to send reset email:', err);
      }
    } else {
      console.warn(`[forgot-password] No account found for ${email} — responding generically.`);
    }

    res.json(GENERIC);
  })
);

router.post(
  '/reset-password',
  asyncHandler(async (req, res: Response) => {
    const token = String((req.body ?? {}).token ?? '').trim();
    const newPassword = String((req.body ?? {}).newPassword ?? '');

    if (!token) throw new ApiError(400, 'Reset token is required.');
    if (newPassword.length < 8) throw new ApiError(400, 'Password must be at least 8 characters.');

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetTokenHash: hashedToken,
      resetTokenExpiry: { $gt: new Date() },
    });

    if (!user) throw new ApiError(400, 'Invalid or expired reset token.');

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetTokenHash = null;
    user.resetTokenExpiry = null;
    user.tokenVersion += 1; // Invalidate every existing refresh token / session.
    await user.save();

    res.json({ message: 'Password reset successfully. Please log in with your new password.' });
  })
);

export default router;
