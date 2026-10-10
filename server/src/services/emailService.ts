import { env } from '../config/env';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const SEND_TIMEOUT_MS = 10_000;

/**
 * Sends the password reset email through Brevo's transactional HTTP API.
 *
 * Render blocks outbound SMTP (the old Gmail transport died with
 * `ETIMEDOUT … command: 'CONN'`), so this is a plain HTTPS call instead —
 * Node 20 ships a global `fetch`, no extra dependency.
 *
 * Returns without throwing when the credentials are missing, so the rest of
 * the app keeps booting and forgot-password still answers with its generic
 * message (the real cause is only logged server-side).
 *
 * The RAW token is sent to the user; only its SHA-256 hash is stored.
 */
export const sendPasswordResetEmail = async (toEmail: string, rawToken: string): Promise<void> => {
  if (!env.brevoApiKey || !env.brevoSenderEmail) {
    console.warn(
      '[emailService] BREVO_API_KEY / BREVO_SENDER_EMAIL are not configured — password reset emails will not be sent.'
    );
    return;
  }

  const resetLink = `${env.frontendUrl}/reset-password?token=${rawToken}`;

  const textContent = [
    'You requested a password reset for your CodeSync account.',
    '',
    'Click the link below to choose a new password:',
    resetLink,
    '',
    'This link expires in 15 minutes.',
    '',
    'If you did not request a reset, you can safely ignore this email.',
  ].join('\n');

  const htmlContent = `
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

  // A stuck request must fail fast instead of holding the request open —
  // an aborted fetch rejects with AbortError, which we retime below.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const response = await fetch(BREVO_SEND_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'api-key': env.brevoApiKey,
      },
      body: JSON.stringify({
        sender: { name: 'CodeSync', email: env.brevoSenderEmail },
        to: [{ email: toEmail }],
        subject: 'Reset your CodeSync password',
        textContent,
        htmlContent,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Brevo send failed: HTTP ${response.status} ${response.statusText} — ${body}`);
    }

    console.info(`[emailService] Password reset email sent to ${toEmail}.`);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Brevo send timed out after ${SEND_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};
