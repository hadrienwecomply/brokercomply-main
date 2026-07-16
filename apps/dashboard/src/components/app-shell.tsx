"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  ListChecks,
  PhoneCall,
  Zap,
  BookOpen,
  Map,
  Settings,
  Sparkles,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/", label: "Portfolio", icon: LayoutGrid },
  { href: "/actions", label: "Prochaines actions", icon: ListChecks },
  { href: "/suivi-commercial", label: "Suivi commercial", icon: PhoneCall },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
  { href: "/faq", label: "Base de connaissances", icon: BookOpen },
  { href: "/roadmap", label: "Roadmap", icon: Map },
  { href: "/automatisations", label: "Automatisations", icon: Zap },
  { href: "/config", label: "Configuration", icon: Settings },
];

export function AppShell({
  children,
  user,
  authEnabled = false,
}: {
  children: React.ReactNode;
  user?: string | null;
  authEnabled?: boolean;
}) {
  const pathname = usePathname();
  // The login page owns its whole layout — no sidebar, no frame.
  if (pathname === "/login") {
    return <>{children}</>;
  }
  // Gate is on but the DB-side check rejected the session (password changed,
  // account deactivated): the cookie is still HMAC-valid so the middleware let
  // the request through — clear it and send the user back to /login.
  if (authEnabled && !user) {
    return <StaleSessionSignout />;
  }
  // The assistant chat fills the whole main area (no max-width / padding frame).
  const fullBleed = pathname.startsWith("/assistant");

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

        {user ? (
          <div className="mt-auto flex items-center gap-2.5 rounded-lg bg-brand-50 p-3">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold uppercase text-white"
            >
              {user.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold capitalize text-brand-800">{user}</p>
              <p className="text-xs text-brand-700/80">Connecté·e</p>
            </div>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                title="Se déconnecter"
                className="flex size-8 items-center justify-center rounded-md text-brand-700/70 transition-colors hover:bg-brand-100 hover:text-brand-800"
              >
                <LogOut className="size-4" aria-hidden />
                <span className="sr-only">Se déconnecter</span>
              </button>
            </form>
          </div>
        ) : (
          <div className="mt-auto rounded-lg bg-brand-50 p-3 text-xs text-brand-800">
            <p className="font-semibold">Pilotage courtier</p>
            <p className="mt-1 text-brand-700/80">
              Suivi du plan d&apos;action de conformité des courtiers.
            </p>
          </div>
        )}
      </aside>

      <main className="flex-1 lg:ml-60">
        {fullBleed ? (
          children
        ) : (
          <div className="mx-auto max-w-[1200px] px-6 py-8">{children}</div>
        )}
      </main>
    </div>
  );
}

/** POSTs to /api/auth/logout (clears the stale cookie) then lands on /login. */
function StaleSessionSignout() {
  useEffect(() => {
    fetch("/api/auth/logout", { method: "POST" }).finally(() => {
      window.location.assign("/login");
    });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-ink-soft">Session expirée — redirection…</p>
    </div>
  );
}
