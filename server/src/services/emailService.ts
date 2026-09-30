import nodemailer from 'nodemailer';
import { env } from '../config/env';

let transporter: nodemailer.Transporter | null = null;

/**
 * Lazily builds the Gmail transporter. Returns null when credentials are
 * missing so the rest of the app still boots (forgot-password then logs a
 * warning instead of crashing).
 */
const getTransporter = (): nodemailer.Transporter | null => {
  if (!env.gmailUser || !env.gmailAppPassword) {
    console.warn(
      '[emailService] GMAIL_USER / GMAIL_APP_PASSWORD are not configured — password reset emails will not be sent.'
    );
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // STARTTLS on 587
      auth: { user: env.gmailUser, pass: env.gmailAppPassword },
    });
  }

  return transporter;
};

/**
 * Sends the password reset email. The RAW token is sent to the user; only its
 * SHA-256 hash is stored in the database.
 */
export const sendPasswordResetEmail = async (toEmail: string, rawToken: string): Promise<void> => {
  const mailTransporter = getTransporter();
  if (!mailTransporter) {
    console.warn(`[emailService] Skipped sending reset email to ${toEmail} (no transport configured).`);
    return;
  }

  const resetLink = `${env.frontendUrl}/reset-password?token=${rawToken}`;

  const text = [
    'You requested a password reset for your CodeSync account.',
    '',
    'Click the link below to choose a new password:',
    resetLink,
    '',
    'This link expires in 15 minutes.',
    '',
    'If you did not request a reset, you can safely ignore this email.',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
      <h1 style="font-size: 22px; margin: 0 0 16px 0;">Reset your CodeSync password</h1>
      <p style="font-size: 15px; line-height: 1.6; color: #6e6e73; margin: 0 0 24px 0;">
        You requested a password reset for your CodeSync account. Click the button below to choose a new password.
      </p>
      <p style="margin: 0 0 24px 0;">
        <a href="${resetLink}"
           style="display: inline-block; background: #5b5fc7; color: #ffffff; font-size: 15px; font-weight: 600;
                  text-decoration: none; border-radius: 8px; padding: 12px 22px;">
          Reset password
        </a>
      </p>
      <p style="font-size: 13px; line-height: 1.6; color: #6e6e73; margin: 0 0 8px 0;">
        Or paste this link into your browser:<br />
        <span style="word-break: break-all; color: #5b5fc7;">${resetLink}</span>
      </p>
      <p style="font-size: 13px; line-height: 1.6; color: #6e6e73; margin: 0;">
        This link expires in <strong>15 minutes</strong>. If you did not request a reset, you can safely ignore this email.
      </p>
    </div>
  `.trim();

  await mailTransporter.sendMail({
    from: `"CodeSync" <${env.gmailUser}>`,
    to: toEmail,
    subject: 'Reset your CodeSync password',
    text,
    html,
  });

  console.info(`[emailService] Password reset email sent to ${toEmail}.`);
};
