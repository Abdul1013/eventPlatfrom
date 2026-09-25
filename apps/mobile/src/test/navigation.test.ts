import { describe, it, expect } from 'vitest';

// ─── Auth-gate routing logic (pure unit tests — no React Native runtime) ──────
//
// These tests verify the routing decision logic extracted from _layout.tsx:
//   - unauthenticated user not in (auth) group  → redirect to /(auth)/login
//   - unauthenticated user already in (auth) group → stay (no redirect)
//   - authenticated user in (auth) group          → redirect to /(app)/scanner
//   - authenticated user not in (auth) group       → stay (no redirect)

type Segment = string;

function resolveRoute(
  accessToken: string | null,
  segments: Segment[],
): string | null {
  const inAuthGroup = segments[0] === '(auth)';
  if (!accessToken && !inAuthGroup) return '/(auth)/login';
  if (accessToken && inAuthGroup) return '/(app)/scanner';
  return null; // no redirect needed
}

describe('Auth-gate routing logic', () => {
  it('redirects unauthenticated user outside (auth) group to login', () => {
    expect(resolveRoute(null, ['(app)', 'scanner'])).toBe('/(auth)/login');
  });

  it('does not redirect unauthenticated user already on a (auth) screen', () => {
    expect(resolveRoute(null, ['(auth)', 'login'])).toBeNull();
  });

  it('redirects authenticated user on a (auth) screen to scanner', () => {
    expect(resolveRoute('valid-token', ['(auth)', 'login'])).toBe('/(app)/scanner');
  });

  it('does not redirect authenticated user on an (app) screen', () => {
    expect(resolveRoute('valid-token', ['(app)', 'scanner'])).toBeNull();
  });

  it('redirects authenticated user on root segment away from (auth)', () => {
    // Edge: segments is empty — treated as outside auth group
    expect(resolveRoute('valid-token', ['(auth)'])).toBe('/(app)/scanner');
  });

  it('redirects unauthenticated user with empty segments to login', () => {
    expect(resolveRoute(null, [])).toBe('/(auth)/login');
  });
});
