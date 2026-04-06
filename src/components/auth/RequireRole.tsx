import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { hasMinRole } from '../../utils/permissions';
import type { UserRole } from '../../types';

interface RequireRoleProps {
  minRole: UserRole;
  children: React.ReactNode;
  /** Where to redirect when the user lacks permission. Defaults to "/" */
  redirectTo?: string;
}

/**
 * Route guard that renders children only when the current user's role
 * meets or exceeds `minRole`. Otherwise redirects.
 */
export function RequireRole({ minRole, children, redirectTo = '/' }: RequireRoleProps) {
  const { isAuthenticated, currentUser } = useAuthStore();

  if (!isAuthenticated || !currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (!hasMinRole(currentUser.role, minRole)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
