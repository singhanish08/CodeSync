import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { extractApiError } from '../lib/api';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { cn } from '../lib/utils';

const scorePassword = (password: string): number => {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
};

export const ResetPassword = () => {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const next: Record<string, string> = {};
    if (newPassword.length < 8) next.newPassword = 'Password must be at least 8 characters.';
    if (newPassword !== confirmPassword) next.confirmPassword = 'Passwords do not match.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      navigate('/login', { replace: true });
    } catch (err) {
      setErrors({ confirmPassword: extractApiError(err, 'Reset failed. The link may be invalid or expired.') });
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/15 text-danger">
            <Lock size={24} />
          </div>
          <h1 className="font-display text-[1.75rem] font-bold text-text-primary">Invalid or missing token</h1>
          <p className="mt-2 text-sm text-text-secondary">
            The reset link is incomplete. Use the link from the email, or request a new one.
          </p>
          <Link to="/forgot-password" className="mt-6 inline-block">
            <Button variant="secondary">Request a new link</Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const score = scorePassword(newPassword);
  const meterColors = ['var(--border)', 'var(--danger)', 'var(--warning)', 'var(--accent)', 'var(--success)'];

  return (
    <AuthLayout>
      <Link
        to="/login"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
      >
        <ArrowLeft size={16} /> Back to sign in
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <motion.span
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-success/15 text-success"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, type: 'spring' }}
        >
          <CheckCircle2 size={22} />
        </motion.span>
        <div>
          <h1 className="font-display text-[1.75rem] font-bold leading-tight text-text-primary">Set a new password</h1>
          <p className="text-sm text-text-secondary">Choose something you'll remember.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-1" noValidate>
        <Input
          name="newPassword"
          label="New password"
          placeholder="At least 8 characters"
          icon={<Lock size={16} />}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          error={errors.newPassword}
          autoComplete="new-password"
          reveal
          autoFocus
        />
        <div
          className={cn(
            'mt-0.5 h-1.5 overflow-hidden rounded-full bg-bg-secondary transition-opacity duration-300',
            newPassword ? 'opacity-100' : 'opacity-0'
          )}
          aria-hidden
        >
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{ width: `${(score / 4) * 100}%`, backgroundColor: meterColors[score] }}
          />
        </div>

        <Input
          name="confirmPassword"
          label="Confirm new password"
          placeholder="Repeat the password"
          icon={<Lock size={16} />}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={errors.confirmPassword}
          autoComplete="new-password"
          reveal
        />

        <Button type="submit" className="mt-2 w-full" loading={submitting}>
          Reset password
        </Button>
      </form>
    </AuthLayout>
  );
};
