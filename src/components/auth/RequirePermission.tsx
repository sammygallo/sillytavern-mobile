import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { hasAnyPermission, hasPermission } from '../../utils/permissions';
import type { Permission } from '../../types';

interface RequirePermissionProps {
  /**
   * Permission(s) the current user must hold. A single string requires that
   * exact permission. An array is treated as OR — any one of the listed
   * permissions grants access. For AND semantics, nest multiple guards.
   */
  permission: Permission | Permission[];
  children: React.ReactNode;
  /** Where to redirect when the user lacks permission. Defaults to "/". */
  redirectTo?: string;
}

/**
 * Route guard that renders children only when the current user holds the
 * required permission. Otherwise redirects.
 *
 * Replaces `RequireRole` — the latter is still exported for backward compat
 * but new routes should use this component.
 */
export function RequirePermission({ permission, children, redirectTo = '/' }: RequirePermissionProps) {
  const { isAuthenticated, currentUser } = useAuthStore();

  if (!isAuthenticated || !currentUser) {
    return <Navigate to="/login" replace />;
  }

  const allowed = Array.isArray(permission)
    ? hasAnyPermission(currentUser, permission)
    : hasPermission(currentUser, permission);

  if (!allowed) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
