import jwt, { JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';

interface BaseTokenPayload extends JwtPayload {
  userId: string;
  tokenVersion: number;
}

interface AccessTokenPayload extends BaseTokenPayload {
  displayName: string;
  role?: string;
}

const ACCESS_EXPIRY = '15m';
const REMEMBER_EXPIRY = '30d';
const SESSION_FALLBACK_EXPIRY = '1d';

/**
 * Short-lived access token. The client keeps it in memory only.
 * `role` is carried for the UI (showing the admin link) but is NEVER trusted
 * for authorization — `requireAdmin` reloads it from the DB so a demotion
 * takes effect immediately instead of waiting out this token's life.
 */
export const signAccessToken = (
  userId: string,
  tokenVersion: number,
  displayName: string,
  role: string = 'user'
): string =>
  jwt.sign({ userId, tokenVersion, displayName, role } satisfies AccessTokenPayload, env.jwtAccessSecret, {
    expiresIn: ACCESS_EXPIRY,
  });

/**
 * Long-lived refresh token, transported in an httpOnly cookie.
 * - rememberMe true  -> 30 day JWT expiry (cookie gets a matching maxAge).
 * - rememberMe false -> session cookie (no maxAge). The JWT still carries a
 *   1-day expiry as a safety net in case a cookie ever leaks.
 */
export const signRefreshToken = (userId: string, tokenVersion: number, rememberMe: boolean): string =>
  jwt.sign({ userId, tokenVersion } satisfies BaseTokenPayload, env.jwtRefreshSecret, {
    expiresIn: rememberMe ? REMEMBER_EXPIRY : SESSION_FALLBACK_EXPIRY,
  });

export const verifyAccessToken = (token: string): AccessTokenPayload =>
  jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;

export const verifyRefreshToken = (token: string): BaseTokenPayload =>
  jwt.verify(token, env.jwtRefreshSecret) as BaseTokenPayload;
