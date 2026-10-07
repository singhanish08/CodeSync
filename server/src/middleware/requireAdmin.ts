import { Response, NextFunction } from 'express';
import { User } from '../models/User';
import { ApiError } from '../utils/apiError';
import { AuthedRequest } from './requireAuth';

/**
 * Guards /api/admin routes. ALWAYS re-reads `role` from the database rather
 * than trusting the copy inside the access token — the token is up to 15
 * minutes stale, and a demoted admin must lose access the moment it happens,
 * not when their token next rotates. Similarly, an account deleted by another
 * admin is stopped here even though its token still verifies.
 */
export const requireAdmin = async (req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user?.id) throw new ApiError(401, 'Unauthorized: missing access token');

    const user = await User.findById(req.user.id).lean().select('role');
    if (!user) throw new ApiError(401, 'Account no longer exists.');
    if (user.role !== 'admin') throw new ApiError(403, 'Admin access required.');

    next();
  } catch (err) {
    next(err);
  }
};
