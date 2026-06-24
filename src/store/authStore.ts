import { create } from 'zustand';
import { loginWithPassword, type UserSession } from '../services/authService';
import { pullSync } from '../services/syncService';

interface AuthState {
  user: UserSession | null;
  isAuthenticated: boolean;
  isOffline: boolean;
  forceOffline: boolean;
  isInitialSyncDone: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  setOfflineStatus: (status: boolean) => void;
  toggleForceOffline: () => void;
  performInitialSync: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => {
  // Load session from localStorage if available
  const storedUser = localStorage.getItem('paud_admin_session');
  const initialUser = storedUser ? JSON.parse(storedUser) : null;
  const storedForceOffline = localStorage.getItem('paud_force_offline') === 'true';

  return {
    user: initialUser,
    isAuthenticated: !!initialUser,
    isOffline: !navigator.onLine,
    forceOffline: storedForceOffline,
    isInitialSyncDone: false,

    login: async (email, password) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));

      try {
        const user = await loginWithPassword(email, password);
        localStorage.setItem('paud_admin_session', JSON.stringify(user));
        set({ user, isAuthenticated: true, isInitialSyncDone: false });
        return true;
      } catch {
        return false;
      }
    },

    logout: () => {
      localStorage.removeItem('paud_admin_session');
      set({ user: null, isAuthenticated: false, isInitialSyncDone: false });
    },

    setOfflineStatus: (status) => set({ isOffline: status }),

    toggleForceOffline: () => {
      const newForce = !get().forceOffline;
      localStorage.setItem('paud_force_offline', newForce.toString());
      set({ forceOffline: newForce });
    },

    performInitialSync: async () => {
      if (get().isInitialSyncDone) return;
      if (get().forceOffline || !navigator.onLine) {
        set({ isInitialSyncDone: true });
        return;
      }
      
      try {
        await pullSync(true); // Pull everything initially
      } catch (error) {
        console.error('Initial sync failed', error);
      } finally {
        set({ isInitialSyncDone: true });
      }
    }
  };
});
