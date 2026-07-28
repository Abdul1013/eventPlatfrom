import { type MouseEvent, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  /**
   * Optional click handler — if provided the default anchor navigation is
   * suppressed, allowing the consuming app to use its own router (e.g.
   * react-router-dom's `navigate`).
   */
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}

export interface AdminShellProps {
  navItems: NavItem[];
  /** Small subtitle shown next to the logo (e.g. "Admin"). */
  title?: string;
  user: { name: string; email: string };
  onLogout: () => void;
  children: ReactNode;
}

export function AdminShell({
  navItems,
  title,
  user,
  onLogout,
  children,
}: AdminShellProps) {


  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* ── Sidebar  */}
      <aside className="h-screen w-64 shrink-0 flex flex-col justify-between bg-white border-r border-gray-200">
        {/* Logo */}
        <div className="px-6 py-5 border-b text-center border-gray-200 flex flex-col ml-10 items-baseline gap-2">
          <span className="text-lg font-bold text-indigo-600">EventFlow</span>
          {title && (
            <span className="text-xs  text-gray-400 font-normal">{title}</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 flex flex-col justify-center px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={item.onClick}
              className={twMerge(
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  item.active
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                ),
              )}
            >
              {item.icon}
              {item.label}
            </a>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-3 py-4 border-t border-gray-200 space-y-4">
          <div className="flex flex-col items-center gap-3 px-3">
            
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full border border-indigo-500 text-center text-sm text-gray-500 hover:text-red-600 transition-colors py-2 rounded-lg hover:bg-red-50"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
