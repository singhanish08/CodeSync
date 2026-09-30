import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { ApiError } from '../utils/apiError';

export interface AuthedRequest extends Request {
  user?: {
    id: string;
    tokenVersion: number;
    displayName: string;
  };
}

/**
 * Validates the access token from the `Authorization: Bearer <token>` header on
 * protected REST routes and attaches the decoded payload to `req.user`.
 */
export const requireAuth = (req: AuthedRequest, _res: Response, next: NextFunction): void => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new ApiError(401, 'Unauthorized: missing access token');
    }

    const token = header.slice('Bearer '.length).trim();
    const decoded = verifyAccessToken(token);

    req.user = {
      id: decoded.userId,
      tokenVersion: decoded.tokenVersion,
      displayName: decoded.displayName,
    };
    next();
  } catch {
    next(new ApiError(401, 'Unauthorized: invalid or expired access token'));
  }
};
