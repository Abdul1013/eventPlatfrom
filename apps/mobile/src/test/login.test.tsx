/**
 * Login screen — React Native Testing Library tests
 *
 * All native-module dependencies are mocked:
 *  - expo-router        → router.replace spy
 *  - @/src/lib/api      → api.post spy
 *  - @/src/store/authStore → useAuthStore returns { setAuth: spy }
 *  - expo-secure-store  → in-memory stub (via setup.ts)
 *
 * @testing-library/react-native renders the component tree using
 * react-test-renderer — no DOM or native bridge required.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import React from 'react';

// ─── Hoisted spies 

const mockRouterReplace = vi.hoisted(() => vi.fn());
const mockApiPost       = vi.hoisted(() => vi.fn());
const mockSetAuth       = vi.hoisted(() => vi.fn());

// ─── Module mocks ─

vi.mock('expo-router', () => ({
  router:      { replace: mockRouterReplace, push: vi.fn(), back: vi.fn() },
  useRouter:   () => ({ replace: mockRouterReplace }),
  useSegments: () => [],
}));

vi.mock('@/src/lib/api', () => ({
  api: { post: mockApiPost },
}));

vi.mock('@/src/store/authStore', () => ({
  useAuthStore: () => ({ setAuth: mockSetAuth }),
}));

// ─── Component import 

import LoginScreen from '../../app/(auth)/login';

// ─── Fixtures ─────

const VALID_EMAIL    = 'staff@example.com';
const VALID_PASSWORD = 'Password1';

const successResponse = {
  data: {
    data: {
      tokens: { accessToken: 'access-tok-123' },
      user:   { id: 'u1', name: 'Staff', email: VALID_EMAIL, role: 'GATEKEEPER', createdAt: '' },
    },
  },
};

// ─── Tests ────────

describe('LoginScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering 

  it('renders email input, password input, and Sign in button', () => {
    render(<LoginScreen />);
    expect(screen.getByPlaceholderText('staff@example.com')).toBeTruthy();
    expect(screen.getByPlaceholderText('••••••••')).toBeTruthy();
    expect(screen.getByText('Sign in')).toBeTruthy();
  });

  // ── Validation errors 

  it('shows validation errors and does not call api when form is empty', async () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByText('Sign in'));

    await waitFor(() => {
      expect(screen.getByText('Invalid email address')).toBeTruthy();
    });
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('shows email validation error for an invalid email format', async () => {
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('staff@example.com'), 'not-an-email');
    fireEvent.changeText(screen.getByPlaceholderText('••••••••'), VALID_PASSWORD);
    fireEvent.press(screen.getByText('Sign in'));

    await waitFor(() => {
      expect(screen.getByText('Invalid email address')).toBeTruthy();
    });
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('shows password validation error when password is empty', async () => {
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('staff@example.com'), VALID_EMAIL);
    // Leave password blank
    fireEvent.press(screen.getByText('Sign in'));

    await waitFor(() => {
      expect(screen.getByText('Password is required')).toBeTruthy();
    });
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  // ── Successful login 

  it('calls api.post, setAuth, and navigates to scanner on success', async () => {
    mockApiPost.mockResolvedValue(successResponse);

    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('staff@example.com'), VALID_EMAIL);
    fireEvent.changeText(screen.getByPlaceholderText('••••••••'), VALID_PASSWORD);
    fireEvent.press(screen.getByText('Sign in'));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/auth/login',
        { email: VALID_EMAIL, password: VALID_PASSWORD },
      );
    });

    expect(mockSetAuth).toHaveBeenCalledWith({
      user:        successResponse.data.data.user,
      accessToken: 'access-tok-123',
    });
    expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/scanner');
  });

  // ── Failed login

  it('shows the server-error banner when api.post rejects', async () => {
    mockApiPost.mockRejectedValue({
      response: { data: { error: { message: 'Invalid credentials' } } },
    });

    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('staff@example.com'), VALID_EMAIL);
    fireEvent.changeText(screen.getByPlaceholderText('••••••••'), VALID_PASSWORD);
    fireEvent.press(screen.getByText('Sign in'));

    await waitFor(() => {
      expect(
        screen.getByText('Invalid email or password. Please try again.'),
      ).toBeTruthy();
    });
    expect(mockSetAuth).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('does not navigate or call setAuth after a failed login', async () => {
    mockApiPost.mockRejectedValue(new Error('Network Error'));

    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('staff@example.com'), VALID_EMAIL);
    fireEvent.changeText(screen.getByPlaceholderText('••••••••'), VALID_PASSWORD);
    fireEvent.press(screen.getByText('Sign in'));

    await waitFor(() =>
      screen.getByText('Invalid email or password. Please try again.'),
    );

    expect(mockSetAuth).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});
