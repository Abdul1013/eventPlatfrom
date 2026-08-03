import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import UserMenu from "./UserMenu";

export interface NavLink {
  href: string;
  label: string;
}

interface AppHeaderProps {
  title: string;
  backHref?: string;
  navLinks?: NavLink[];
}

export default async function AppHeader({
  title,
  backHref,
  navLinks = [],
}: AppHeaderProps) {
  const user = await getCurrentUser();
  const profile = user ? { full_name: user.name, role: user.role } : null;

  return (
    <header className="sticky top-0 z-40 border-b border-accent/20 bg-background/95 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center gap-4">
        {/* Left: back button + brand */}
        <div className="flex items-center gap-2 shrink-0">
          {backHref && (
            <Link
              href={backHref}
              className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-foreground/5 text-foreground/60 hover:text-foreground transition"
              aria-label="Go back"
            >
              <ChevronLeft size={20} />
            </Link>
          )}
          <Link href="/" className="text-xl font-bold text-primary leading-none">
            EventMerge
          </Link>
          {title && (
            <>
              <span className="text-foreground/30 hidden sm:inline">/</span>
              <span className="text-sm font-medium text-foreground/70 hidden sm:inline">
                {title}
              </span>
            </>
          )}
        </div>

        {/* Center: nav links */}
        {navLinks.length > 0 && (
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-3 py-2 rounded-lg text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-foreground/5 transition min-h-[44px] flex items-center"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}

        {/* Right: user menu */}
        <div className="ml-auto shrink-0">
          {user && profile ? (
            <UserMenu
              email={user.email ?? ""}
              fullName={profile.full_name}
              role={profile.role}
            />
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-4 py-2 text-sm font-medium text-foreground/70 hover:text-foreground transition min-h-[44px] flex items-center"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition min-h-[44px] flex items-center"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Mobile nav */}
      {navLinks.length > 0 && (
        <div className="md:hidden border-t border-accent/10 px-4 flex gap-1 overflow-x-auto pb-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-3 py-2 text-sm font-medium text-foreground/70 hover:text-foreground whitespace-nowrap transition min-h-[44px] flex items-center"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
