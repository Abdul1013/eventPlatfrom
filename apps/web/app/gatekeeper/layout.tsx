import AppHeader from "@/components/AppHeader";

const navLinks = [
  { href: "/gatekeeper", label: "Dashboard" },
  { href: "/gatekeeper/scan", label: "Scanner" },
  { href: "/gatekeeper/history", label: "History" },
];

export default function GatekeeperLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <AppHeader title="Gatekeeper" navLinks={navLinks} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
