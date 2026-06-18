import type { UserSession } from '../services/authService';
import type { ServiceActor } from '../services/service-helpers';

export function getCurrentActor(user: UserSession | null): ServiceActor | null {
  if (!user) {
    return null;
  }

  return {
    userId: user.id,
    role: user.role,
  };
}
