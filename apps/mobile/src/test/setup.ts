/**
 * Global test setup for the mobile app.
 * Runs before every test file via vitest.config.ts → setupFiles.
 *
 * React Native's JavaScript layer expects several globals and native-module
 * stubs that only exist on device / in jest-expo. We provide them here so
 * that react-native and @testing-library/react-native can initialise cleanly
 * in a Node environment.
 */

import { vi } from 'vitest';

// ─── React Native globals 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = true;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).nativeModuleProxy = new Proxy({}, { get: () => () => {} });

// ─── expo-router 
// The router singleton imports native navigation modules on load.
// Tests that don't import expo-router directly still need this stub because
// @/src/lib/api.ts imports it for 401-redirect handling.

vi.mock('expo-router', () => ({
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn() },
  useRouter:   () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useSegments: () => [],
  Stack: { Screen: () => null },
}));

// ─── expo-secure-store 
// Zustand's persist middleware calls SecureStore async methods.
// Tests that want to verify specific calls can import SecureStore and spy on it.

vi.mock('expo-secure-store', () => {
  const store: Record<string, string> = {};
  return {
    getItemAsync:    vi.fn((k: string) => Promise.resolve(store[k] ?? null)),
    setItemAsync:    vi.fn((k: string, v: string) => { store[k] = v; return Promise.resolve(); }),
    deleteItemAsync: vi.fn((k: string) => { delete store[k]; return Promise.resolve(); }),
  };
});

// ─── nativewind 
// The nativewind babel plugin transforms className → style at build time.
// In tests (no babel transform) className is just ignored by the renderer —
// no explicit mock needed unless the package is imported directly.

// ─── react-native-toast-message 
vi.mock('react-native-toast-message', () => ({
  default: { show: vi.fn(), hide: vi.fn() },
}));
