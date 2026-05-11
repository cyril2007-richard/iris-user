import { create } from 'zustand';

interface AuthState {
  user: any | null;
  isInitialized: boolean;
  setUser: (user: any | null) => void;
  setInitialized: (status: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isInitialized: false, // Start as false to ensure mount happens before redirect
  setUser: (user) => set({ user }),
  setInitialized: (status) => set({ isInitialized: status }),
}));
