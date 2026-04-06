import type { UserRole } from '../types';

/**
 * Role hierarchy (higher index = more privilege):
 *   end_user < contributor < admin < owner
 */
const ROLE_LEVEL: Record<UserRole, number> = {
  end_user: 0,
  contributor: 1,
  admin: 2,
  owner: 3,
};

/** Actions that can be checked with `can()`. */
export type Action =
  | 'chat'                  // send/receive messages
  | 'character:view'        // browse character list
  | 'character:create'      // create / import characters
  | 'character:edit'        // edit existing characters
  | 'character:delete'      // delete characters
  | 'settings:view'         // access settings page
  | 'settings:api_keys'     // manage API keys / secrets
  | 'admin:panel';          // access admin panel / user management

/** Minimum role required for each action. */
const ACTION_MIN_ROLE: Record<Action, UserRole> = {
  'chat':              'end_user',
  'character:view':    'end_user',
  'character:create':  'contributor',
  'character:edit':    'contributor',
  'character:delete':  'contributor',
  'settings:view':     'admin',
  'settings:api_keys': 'admin',
  'admin:panel':       'admin',
};

/** Check whether `role` is allowed to perform `action`. */
export function can(role: UserRole | undefined, action: Action): boolean {
  if (!role) return false;
  return ROLE_LEVEL[role] >= ROLE_LEVEL[ACTION_MIN_ROLE[action]];
}

/** Check if role meets a minimum role threshold. */
export function hasMinRole(role: UserRole | undefined, minRole: UserRole): boolean {
  if (!role) return false;
  return ROLE_LEVEL[role] >= ROLE_LEVEL[minRole];
}
