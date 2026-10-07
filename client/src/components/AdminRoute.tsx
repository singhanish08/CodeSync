import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from './ui/Spinner';

/**
 * Gate for /admin. Mirrors ProtectedRoute, then checks the role from the
 * session. The role shown here comes from the access token / refresh response
 * and may lag a demotion by up to a token lifetime — the server re-checks the
 * DB on every /api/admin call, so a stale client role can render the page but
 * cannot reach any data.
 */
export const AdminRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-3 text-text-secondary">
          <Spinner className="h-8 w-8" />
          <span className="text-sm">Loading admin tools…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.role !== 'admin') {
    // Non-admins get redirected rather than shown a 403 page — the panel is
    // simply not part of their app.
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
