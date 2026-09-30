import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { extractApiError } from '../lib/api';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Animated envelope illustration for the success state. */
const Envelope = () => (
  <motion.div
    initial={{ scale: 0.6, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ duration: 0.5, type: 'spring', stiffness: 200, damping: 18 }}
    className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center"
  >
    <motion.span
      className="absolute inset-0 rounded-2xl"
      style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)' }}
      animate={{ scale: [1, 1.15, 1] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      aria-hidden
    />
    <Mail size={26} className="relative text-accent" />
    <motion.span
      className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-success text-white"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ delay: 0.4, type: 'spring', stiffness: 260, damping: 14 }}
    >
      <CheckCircle2 size={14} />
    </motion.span>
  </motion.div>
);

export const ForgotPassword = () => {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(extractApiError(err, 'Request failed. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <Link
        to="/login"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
      >
        <ArrowLeft size={16} /> Back to sign in
      </Link>

      {sent ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center"
        >
          <Envelope />
          <h1 className="font-display text-[1.75rem] font-bold text-text-primary">Check your inbox</h1>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            If an account exists for <span className="font-medium text-text-primary">{email}</span>, a reset link is
            on its way. It expires in 15 minutes.
          </p>
          <p className="mt-6 text-center font-mono text-[10px] text-text-secondary/70">
            no email? check spam, or the link may have already been used
          </p>
        </motion.div>
      ) : (
        <>
          <h1 className="font-display text-[1.75rem] font-bold leading-tight text-text-primary">
            Forgot your password?
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Enter your email and we'll send a one-time reset link.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-1" noValidate>
            <Input
              name="email"
              type="email"
              label="Email"
              placeholder="you@example.com"
              icon={<Mail size={16} />}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={error}
              autoComplete="email"
              autoFocus
            />
            <Button type="submit" className="mt-2 w-full" loading={submitting}>
              Send reset link
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  );
};
