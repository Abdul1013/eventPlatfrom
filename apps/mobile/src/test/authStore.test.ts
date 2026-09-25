import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as SecureStore from 'expo-secure-store';

// ─── Mock expo-secure-store 
// Expose the in-memory backing store so tests can pre-populate it for
// rehydration tests and verify call args.

const _store: Record<string, string> = {};

vi.mock('expo-secure-store', () => ({
  getItemAsync:    vi.fn((key: string) => Promise.resolve(_store[key] ?? null)),
  setItemAsync:    vi.fn((key: string, value: string) => {
    _store[key] = value;
    return Promise.resolve();
  }),
  deleteItemAsync: vi.fn((key: string) => {
    delete _store[key];
    return Promise.resolve();
  }),
}));

// ─── Import after mock 

import { useAuthStore } from '../store/authStore';

// ─── Fixtures 

const fakeUser = {
  id:        'user-1',
  name:      'Test Staff',
  email:     'staff@example.com',
  role:      'GATEKEEPER' as const,
  createdAt: new Date().toISOString(),
};

const fakeToken = 'eyJhbGciOiJIUzI1NiJ9.test.sig';

/** Flush one microtask — the Zustand persist middleware writes storage async. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

// ─── Tests 

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(_store).forEach((k) => delete _store[k]);
    useAuthStore.setState({ user: null, accessToken: null });
  });

  // ── Initial state 

  it('initialises with null user and accessToken', () => {
    const { user, accessToken } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(accessToken).toBeNull();
  });

  // ── setAuth 

  it('setAuth stores user and accessToken in Zustand state', () => {
    useAuthStore.getState().setAuth({ user: fakeUser, accessToken: fakeToken });
    const { user, accessToken } = useAuthStore.getState();
    expect(user).toEqual(fakeUser);
    expect(accessToken).toBe(fakeToken);
  });

  it('setAuth triggers SecureStore.setItemAsync via the persist middleware', async () => {
    useAuthStore.getState().setAuth({ user: fakeUser, accessToken: fakeToken });
    await flush();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'ef-staff-auth',
      expect.stringContaining(fakeToken),
    );
  });

  it('setAuth is idempotent — subsequent call overwrites previous data', () => {
    const anotherUser  = { ...fakeUser, id: 'user-2', name: 'Another Staff' };
    const anotherToken = 'eyJhbGciOiJIUzI1NiJ9.other.sig';
    useAuthStore.getState().setAuth({ user: fakeUser,    accessToken: fakeToken });
    useAuthStore.getState().setAuth({ user: anotherUser, accessToken: anotherToken });
    const { user, accessToken } = useAuthStore.getState();
    expect(user).toEqual(anotherUser);
    expect(accessToken).toBe(anotherToken);
  });

  // ── clearAuth

  it('clearAuth resets user and accessToken to null', () => {
    useAuthStore.getState().setAuth({ user: fakeUser, accessToken: fakeToken });
    useAuthStore.getState().clearAuth();
    const { user, accessToken } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(accessToken).toBeNull();
  });

  it('clearAuth triggers SecureStore.setItemAsync with null values in persisted payload', async () => {
    useAuthStore.getState().setAuth({ user: fakeUser, accessToken: fakeToken });
    vi.clearAllMocks();
    useAuthStore.getState().clearAuth();
    await flush();

    expect(SecureStore.setItemAsync).toHaveBeenCalledOnce();
    const [, serialised] = (SecureStore.setItemAsync as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      string,
    ];
    const parsed = JSON.parse(serialised) as { state: { user: null; accessToken: null } };
    expect(parsed.state.user).toBeNull();
    expect(parsed.state.accessToken).toBeNull();
  });

  // ── Rehydration 

  it('rehydrates user and accessToken from SecureStore on persist.rehydrate()', async () => {
    // Pre-populate the mock SecureStore with a previously persisted session
    _store['ef-staff-auth'] = JSON.stringify({
      state:   { user: fakeUser, accessToken: fakeToken },
      version: 0,
    });
    // Reset in-memory state to simulate a fresh app load
    useAuthStore.setState({ user: null, accessToken: null });

    await useAuthStore.persist.rehydrate();

    const { user, accessToken } = useAuthStore.getState();
    expect(user).toEqual(fakeUser);
    expect(accessToken).toBe(fakeToken);
  });

  it('starts with null state when SecureStore has no saved session', async () => {
    // _store is empty — simulates first app launch
    useAuthStore.setState({ user: null, accessToken: null });
    await useAuthStore.persist.rehydrate();

    const { user, accessToken } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(accessToken).toBeNull();
  });

  it('handles corrupted SecureStore data gracefully (does not throw)', async () => {
    _store['ef-staff-auth'] = 'not-valid-json{{{';
    useAuthStore.setState({ user: null, accessToken: null });
    await expect(useAuthStore.persist.rehydrate()).resolves.not.toThrow();
  });
});
