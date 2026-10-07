import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { ApiError } from './utils/apiError';
import authRoutes from './routes/authRoutes';
import roomRoutes from './routes/roomRoutes';
import adminRoutes from './routes/adminRoutes';

/**
 * Creates the Express app. Kept separate from index.ts so the HTTP server
 * (and the Socket.io server bound to it) can be composed cleanly.
 */
export const createApp = (): express.Application => {
  const app = express();

  // Body parsing. `limit` is generous because code files can be large.
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // Populate req.cookies so /auth/refresh can read the httpOnly refresh cookie.
  app.use(cookieParser());

  // CORS with credentials so the httpOnly refresh cookie works cross-domain
  // (Vercel frontend ↔ Render backend) in production.
  app.use(
    cors({
      origin: env.frontendUrl,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })
  );

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/admin', adminRoutes);

  // 404 for unknown routes.
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Global error handler — always emit a clean JSON error, never a stack trace.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }

    if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
      res.status(400).json({ error: 'Malformed JSON body.' });
      return;
    }

    console.error('[express] Unhandled error:', err);
    const message = env.isProduction ? 'Internal server error' : err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  });

  return app;
};
