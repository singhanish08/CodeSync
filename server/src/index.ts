import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import { env } from './config/env';
import { createApp } from './app';
import { registerSocketHandlers } from './sockets/socketHandlers';

const start = async (): Promise<void> => {
  try {
    // Fail fast with a clear message if the DB is unreachable.
    mongoose.set('strictQuery', true);
    await mongoose.connect(env.mongoUri);
    console.info('[server] Connected to MongoDB');
  } catch (err) {
    console.error('[server] Failed to connect to MongoDB:', err);
    process.exit(1);
  }

  const app = createApp();
  const httpServer = http.createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.frontendUrl,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    // Free-tier hosts (Render) sit behind a proxy that only supports polling
    // until the WebSocket upgrade succeeds; allow both.
    transports: ['websocket', 'polling'],
  });

  registerSocketHandlers(io);

  httpServer.listen(env.port, () => {
    console.info(`[server] CodeSync API listening on port ${env.port} (${env.nodeEnv})`);
  });

  const shutdown = async (signal: string) => {
    console.info(`[server] ${signal} received — shutting down`);
    httpServer.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
};

void start();
