import { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Wraps an async route handler so rejected promises are forwarded to Express's
 * error middleware instead of producing an unhandled rejection.
 */
export const asyncHandler = (fn: AsyncRoute): RequestHandler => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
