import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import type { AuthUser } from '@eventmerge/types';

// ─── Secure storage adapter for Zustand persist ───────────────────────────────
// Typed to the *persisted* subset (see partialize) — functions aren't serialized.

interface PersistedAuth {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
}

const secureStorage = createJSONStorage<PersistedAuth>(() => ({
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) => SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
}));

// ─── Store types ──────────────────────────────────────────────────────────────

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (data: { user: AuthUser; accessToken: string; refreshToken?: string }) => void;
  setTokens: (data: { accessToken: string; refreshToken?: string }) => void;
  clearAuth: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (data) =>
        set((s) => ({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken ?? s.refreshToken,
        })),
      setTokens: (data) =>
        set((s) => ({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken ?? s.refreshToken,
        })),
      clearAuth: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    {
      name: 'em-staff-auth',
      storage: secureStorage,
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken }),
    },
  ),
);
