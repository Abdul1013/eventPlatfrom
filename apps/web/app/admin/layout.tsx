import AppHeader from "@/components/AppHeader";

const navLinks = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/logs", label: "Logs" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <AppHeader title="Admin" navLinks={navLinks} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
