import type { Metadata } from "next";
import { safeNextPath } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Connexion — BrokerComply",
};

/**
 * Branded sign-in page replacing the native Basic Auth popup. Split screen:
 * a deep-green brand panel riffing on the logo's three-square mosaic, and a
 * quiet form column. The panel collapses on small screens.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next);

  return (
    <div className="flex min-h-screen">
      <style>{`
        @keyframes login-rise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes login-tile {
          from { opacity: 0; transform: scale(0.86); }
          to   { opacity: 1; transform: none; }
        }
        .login-rise { animation: login-rise 500ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .login-tile { animation: login-tile 700ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          .login-rise, .login-tile { animation: none; }
        }
      `}</style>

      {/* Brand panel — the logo's mosaic, blown up into an atmosphere. */}
      <aside className="relative hidden flex-1 overflow-hidden bg-brand-900 lg:block">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 15% 10%, rgba(95,191,153,0.28) 0%, transparent 55%), radial-gradient(100% 80% at 90% 95%, rgba(126,134,220,0.22) 0%, transparent 60%)",
          }}
        />

        {/* Mosaic tiles echoing the three-square logo. */}
        <div aria-hidden className="absolute inset-0">
          <div className="login-tile absolute left-[8%] top-[12%] size-28 bg-purple-500/70" style={{ animationDelay: "120ms" }} />
          <div className="login-tile absolute left-[8%] top-[calc(12%+7rem)] size-28 bg-brand-500/80" style={{ animationDelay: "220ms" }} />
          <div className="login-tile absolute left-[calc(8%+7rem)] top-[calc(12%+7rem)] size-28 bg-brand-400/40" style={{ animationDelay: "320ms" }} />
          <div className="login-tile absolute bottom-[18%] right-[10%] size-40 bg-brand-500/25" style={{ animationDelay: "420ms" }} />
          <div className="login-tile absolute bottom-[calc(18%+10rem)] right-[10%] size-20 bg-purple-500/35" style={{ animationDelay: "520ms" }} />
          <div className="login-tile absolute bottom-[18%] right-[calc(10%+10rem)] size-20 bg-brand-300/20" style={{ animationDelay: "620ms" }} />
        </div>

        <div className="relative flex h-full flex-col justify-end p-12 xl:p-16">
          <div className="login-rise max-w-md space-y-4" style={{ animationDelay: "250ms" }}>
            <h2 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight text-white xl:text-[2.75rem]">
              La conformité de vos courtiers, sous contrôle.
            </h2>
            <p className="text-[15px] leading-relaxed text-brand-100/80">
              Plans d&apos;action FSMA, audits de sites et de publicités, base de
              connaissances réglementaire — tout le back-office WeComply, au même endroit.
            </p>
          </div>
          <p className="login-rise mt-10 text-xs uppercase tracking-[0.18em] text-brand-100/50" style={{ animationDelay: "400ms" }}>
            WeComply · Compliance courtiers · Belgique
          </p>
        </div>
      </aside>

      {/* Form column */}
      <main className="flex flex-1 items-center justify-center bg-canvas px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="login-rise flex items-center gap-3">
            <img
              src="/brokercomply-logo.svg"
              alt=""
              className="h-9 w-auto"
              width={24}
              height={36}
            />
            <span className="font-display text-2xl font-semibold leading-none text-ink">
              Broker<span className="text-brand-600">comply</span>
            </span>
          </div>

          <div className="login-rise mt-9 space-y-1.5" style={{ animationDelay: "90ms" }}>
            <h1 className="font-display text-[1.65rem] font-semibold tracking-tight text-ink">
              Bon retour
            </h1>
            <p className="text-[15px] text-st-na">
              Connectez-vous pour accéder au pilotage de vos courtiers.
            </p>
          </div>

          <div className="login-rise mt-8" style={{ animationDelay: "180ms" }}>
            <LoginForm next={next} />
          </div>

          <p className="login-rise mt-10 text-xs leading-relaxed text-st-na/80" style={{ animationDelay: "270ms" }}>
            Accès réservé à l&apos;équipe WeComply. Un problème de connexion&nbsp;?
            Contactez l&apos;administrateur.
          </p>
        </div>
      </main>
    </div>
  );
}
