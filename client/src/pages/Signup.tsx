import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { extractApiError } from '../lib/api';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';
import { cn } from '../lib/utils';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface PasswordScore {
  score: number;
  label: string;
}

/**
 * Calm, non-judgmental strength meter. It reports what a password has rather
 * than shaming the user, and never blocks submission beyond the 8-char floor.
 */
const scorePassword = (password: string): PasswordScore => {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  const labels = ['too short', 'fair', 'good', 'strong', 'excellent'];
  const clamped = password.length === 0 ? 0 : Math.min(score, 4);
  return { score: clamped, label: labels[clamped] };
};

export const Signup = () => {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!displayName.trim()) next.displayName = 'Display name is required.';
    if (!EMAIL_RE.test(email)) next.email = 'Enter a valid email address.';
    if (password.length < 8) next.password = 'Password must be at least 8 characters.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await signup(email, password, displayName);
      navigate('/dashboard');
    } catch (err) {
      // Same gap Login had: AuthContext parks the message in `error`, which
      // this page never reads, so a failed sign-up looked like a dead button.
      // The API's own reason ("An account with that email already exists.",
      // validation errors) is passed through verbatim; only a transport
      // failure falls back to the connection wording.
      toast({
        title: 'Signup Failed',
        description: extractApiError(err, 'Could not reach the server. Check your connection and try again.'),
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const { score, label } = scorePassword(password);
  const meterWidths = ['0%', '25%', '50%', '75%', '100%'];
  const meterColors = ['var(--border)', 'var(--danger)', 'var(--warning)', 'var(--accent)', 'var(--success)'];

  return (
    <AuthLayout>
      <h1 className="font-display text-[1.75rem] font-bold leading-tight text-text-primary">
        Create your account
      </h1>
      <p className="mt-2 text-sm text-text-secondary">Start collaborating in seconds.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-1" noValidate>
        <Input
          name="displayName"
          type="text"
          label="Display name"
          placeholder="Ada Lovelace"
          icon={<User size={16} />}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          error={errors.displayName}
          autoComplete="name"
        />
        <Input
          name="email"
          type="email"
          label="Email"
          placeholder="you@example.com"
          icon={<Mail size={16} />}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          autoComplete="email"
        />
        <div>
          <Input
            name="password"
            label="Password"
            placeholder="At least 8 characters"
            icon={<Lock size={16} />}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
            autoComplete="new-password"
            reveal
          />
          {/* Calm strength meter — animates width/colour, no layout shift */}
          <div
            className={cn(
              'mt-0.5 h-1.5 overflow-hidden rounded-full bg-bg-secondary transition-opacity duration-300',
              password ? 'opacity-100' : 'opacity-0'
            )}
            aria-hidden
          >
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: meterWidths[score], backgroundColor: meterColors[score] }}
            />
          </div>
          {password && (
            <p className="mb-2 mt-1 font-mono text-[10px] text-text-secondary">
              {label} · {score + 1 >= 3 ? 'nice' : 'add length or a symbol'}
            </p>
          )}
        </div>

        <Button type="submit" className="mt-2 w-full" loading={submitting}>
          Sign up
          {!submitting && <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-text-secondary">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
};
