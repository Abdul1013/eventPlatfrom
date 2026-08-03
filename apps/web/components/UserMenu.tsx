"use client";

import { useState, useRef, useEffect } from "react";
import { signOut } from "@/lib/actions/auth";
import { User, LogOut, ChevronDown, Shield } from "lucide-react";

interface UserMenuProps {
  email: string;
  fullName: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  ORGANIZER: "Organizer",
  ATTENDEE: "Attendee",
  GATEKEEPER: "Gatekeeper",
};

export default function UserMenu({ email, fullName, role }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initials = fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-foreground/5 transition min-h-[44px]"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
          {initials || <User size={14} />}
        </span>
        <span className="hidden sm:block text-sm font-medium text-foreground max-w-[120px] truncate">
          {fullName}
        </span>
        <ChevronDown
          size={14}
          className={`text-foreground/60 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-background border border-accent/20 rounded-xl shadow-lg z-50 overflow-hidden">
          {/* User info */}
          <div className="px-4 py-3 border-b border-accent/20">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                {initials || <User size={16} />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{fullName}</p>
                <p className="text-xs text-foreground/60 truncate">{email}</p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1">
              <Shield size={12} className="text-accent" />
              <span className="text-xs font-medium text-accent">
                {ROLE_LABELS[role] ?? role}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="p-1">
            <button
              onClick={async () => {
                setOpen(false);
                await signOut();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground/70 hover:bg-destructive/10 hover:text-destructive transition min-h-[44px]"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
