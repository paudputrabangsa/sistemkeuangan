import { create } from 'zustand';
import { loginWithPassword, type UserSession } from '../services/authService';

interface AuthState {
  user: UserSession | null;
  isAuthenticated: boolean;
  isOffline: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  setOfflineStatus: (status: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => {
  // Load session from localStorage if available
  const storedUser = localStorage.getItem('paud_admin_session');
  const initialUser = storedUser ? JSON.parse(storedUser) : null;

  return {
    user: initialUser,
    isAuthenticated: !!initialUser,
    isOffline: !navigator.onLine,

    login: async (email, password) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));

      try {
        const user = await loginWithPassword(email, password);
        localStorage.setItem('paud_admin_session', JSON.stringify(user));
        set({ user, isAuthenticated: true });
        return true;
      } catch {
        return false;
      }
    },

    logout: () => {
      localStorage.removeItem('paud_admin_session');
      set({ user: null, isAuthenticated: false });
    },

    setOfflineStatus: (status) => set({ isOffline: status }),
  };
});
