import { type MouseEvent, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface AttendeeNavItem {
  href: string;
  label: string;
  active?: boolean;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}

export interface AttendeeShellProps {
  navItems: AttendeeNavItem[];
  /** Pass the authenticated user to show user avatar + sign-out; null/undefined shows a Sign in link. */
  user?: { name: string } | null;
  onLogout?: () => void;
  children: ReactNode;
}

export function AttendeeShell({
  navItems,
  user,
  onLogout,
  children,
}: AttendeeShellProps) {
  const initials = user?.name ? user.name.charAt(0).toUpperCase() : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top navbar ──────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <span className="text-lg font-bold text-indigo-600">EventFlow</span>

            {/* Nav links */}
            <nav className="flex items-center gap-1">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={item.onClick}
                  className={twMerge(
                    clsx(
                      'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      item.active
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
                    ),
                  )}
                >
                  {item.label}
                </a>
              ))}
            </nav>

            {/* User actions */}
            <div className="flex items-center gap-2">
              {user ? (
                <>
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-semibold">
                    {initials}
                  </div>
                  {onLogout && (
                    <button
                      onClick={onLogout}
                      className="text-sm text-gray-500 hover:text-red-600 transition-colors px-2 py-1 rounded"
                    >
                      Sign out
                    </button>
                  )}
                </>
              ) : (
                <a
                  href="/login"
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700 px-3 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors"
                >
                  Sign in
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Page content ────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}
