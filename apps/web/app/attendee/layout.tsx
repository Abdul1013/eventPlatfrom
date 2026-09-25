import AppHeader from "@/components/AppHeader";

const navLinks = [
  { href: "/attendee", label: "Dashboard" },
  { href: "/events", label: "Browse Events" },
  { href: "/attendee/wallet", label: "My Wallet" },
  { href: "/attendee/orders", label: "Orders" },
];

export default function AttendeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <AppHeader title="Attendee" navLinks={navLinks} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
