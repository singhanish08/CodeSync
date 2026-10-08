import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { extractApiError } from '../lib/api';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Switch } from '../components/ui/Switch';
import { GradientText } from '../components/ui/GradientText';
import { useToast } from '../components/ui/Toast';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!EMAIL_RE.test(email)) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Password is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await login(email, password, rememberMe);
      navigate('/dashboard');
    } catch (err) {
      // Nothing was rendered on a failed attempt before this: AuthContext only
      // parks the message in `error`, which this page never reads. The API
      // already returns bad credentials as ONE combined message ("Invalid
      // email or password."), so it is passed through verbatim — never split
      // into a wrong-email vs wrong-password hint here.
      toast({
        title: 'Login Failed',
        description: extractApiError(err, 'Could not reach the server. Check your connection and try again.'),
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="font-display text-[1.75rem] font-bold leading-tight text-text-primary">
        Welcome back
      </h1>
      <p className="mt-2 text-sm text-text-secondary">
        Sign in to continue to your rooms.
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
          error={errors.email}
          autoComplete="email"
        />
        <Input
          name="password"
          label="Password"
          placeholder="••••••••"
          icon={<Lock size={16} />}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          autoComplete="current-password"
          reveal
        />

        <div className="flex items-center justify-between gap-4 py-2">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-text-secondary">
            <Switch checked={rememberMe} onChange={setRememberMe} label="Remember me" />
            Remember me
          </label>
          <Link to="/forgot-password" className="text-sm text-accent hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" className="mt-2 w-full" loading={submitting}>
          Sign in
          {!submitting && <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-text-secondary">
        Don't have an account?{' '}
        <Link to="/signup" className="font-medium text-accent hover:underline">
          Sign up
        </Link>
      </p>

      <p className="mt-6 text-center font-mono text-[10px] text-text-secondary/70">
        <GradientText>access token in memory · refresh token in a cookie</GradientText>
      </p>
    </AuthLayout>
  );
};
