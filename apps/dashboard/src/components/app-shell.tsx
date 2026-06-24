"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, ListChecks, Zap, BookOpen, Map, Settings } from "lucide-react";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/", label: "Portfolio", icon: LayoutGrid },
  { href: "/actions", label: "Prochaines actions", icon: ListChecks },
  { href: "/faq", label: "Base de connaissances", icon: BookOpen },
  { href: "/roadmap", label: "Roadmap", icon: Map },
  { href: "/automatisations", label: "Automatisations", icon: Zap },
  { href: "/config", label: "Configuration", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-white px-4 py-5 lg:flex">
        <Link href="/" className="mb-8 flex items-center gap-2.5 px-2">
          <img
            src="/brokercomply-logo.svg"
            alt="Brokercomply"
            className="h-7 w-auto shrink-0"
            width={19}
            height={28}
          />
          <span className="font-display text-lg font-semibold leading-none text-ink">
            Broker<span className="text-brand-600">comply</span>
          </span>
        </Link>

        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-soft hover:bg-line/60 hover:text-ink",
                )}
              >
                <Icon className="size-[18px]" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-lg bg-brand-50 p-3 text-xs text-brand-800">
          <p className="font-semibold">Pilotage courtier</p>
          <p className="mt-1 text-brand-700/80">
            Suivi du plan d&apos;action de conformité. Données de démonstration.
          </p>
        </div>
      </aside>

      <main className="flex-1 lg:ml-60">
        <div className="mx-auto max-w-[1200px] px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
