import dotenv from 'dotenv';

dotenv.config();

/**
 * Reads a required environment variable. Throws a clear, actionable error at
 * boot time if it is missing so the server never silently mis-configures itself.
 */
const required = (name: string): string => {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy server/.env.example to server/.env and fill it in.`
    );
  }
  return value.trim();
};

export const env = {
  port: process.env.PORT || 5175,
  mongoUri: required('MONGODB_URI'),
  jwtAccessSecret: required('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  groqApiKey: process.env.GROQ_API_KEY || '',
  brevoApiKey: process.env.BREVO_API_KEY || '',
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5176',
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  // The yjs_update hot path logs per keystroke; gate the chatty info logs
  // behind this so production logs stay readable. On by default in dev, or
  // explicitly with SOCKET_DEBUG=1.
  socketDebug: process.env.SOCKET_DEBUG === '1' || process.env.NODE_ENV !== 'production',
};
