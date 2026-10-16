import { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import Spinner from '@/components/ui/Spinner';

// roles is optional: without it any signed in user gets through, with it the role has to be listed.
export default function ProtectedRoute({ roles, children }) {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const warned = useRef(false);
  const isRoleBlocked = Boolean(user && roles && !roles.includes(user.role));

  useEffect(() => {
    // the message is sent once, even though StrictMode runs this effect twice in development
    if (isRoleBlocked && !warned.current) {
      warned.current = true;
      toast.error('You do not have access to that page');
    }
  }, [isRoleBlocked, toast]);

  // while the session is being restored, showing the login page would be a flash of the wrong answer
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <Spinner label="Restoring your session" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (isRoleBlocked) {
    return <Navigate to="/" replace />;
  }

  return children;
}
