import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { Dashboard } from './pages/Dashboard';
import { Landing } from './pages/Landing';
import { NotFound } from './pages/NotFound';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { CaretLoader } from './components/ui/Spinner';

// The editor pulls in Monaco + Yjs. Keep it out of the landing/auth bundles.
const RoomEditor = lazy(() =>
  import('./pages/RoomEditor').then((module) => ({ default: module.RoomEditor }))
);

// The admin console is only reachable to admins; code-splitting it keeps
// tables and icons out of every visitor's first bundle.
const AdminDashboard = lazy(() =>
  import('./pages/AdminDashboard').then((module) => ({ default: module.AdminDashboard }))
);

const EditorFallback = () => (
  <div className="flex h-screen items-center justify-center bg-bg-primary">
    <CaretLoader />
  </div>
);

const App = () => (
  <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={<Login />} />
    <Route path="/signup" element={<Signup />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />

    <Route
      path="/dashboard"
      element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      }
    />
    <Route
      path="/room/:roomId"
      element={
        <ProtectedRoute>
          <Suspense fallback={<EditorFallback />}>
            <RoomEditor />
          </Suspense>
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin"
      element={
        <AdminRoute>
          <Suspense fallback={<EditorFallback />}>
            <AdminDashboard />
          </Suspense>
        </AdminRoute>
      }
    />

    <Route path="*" element={<NotFound />} />
  </Routes>
);

export default App;
