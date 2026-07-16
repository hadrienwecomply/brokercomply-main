import type { Metadata } from "next";
import { Inter, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { isAuthEnabled } from "@/lib/auth";
import { currentUser } from "@/lib/session.server";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BrokerComply — Pilotage courtier",
  description:
    "Back-office de suivi du plan d'action de conformité pour compliance officers.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Who is signed in — DB-validated (null when the gate is disabled, e.g.
  // local dev, or when the session went stale: password changed, deactivated).
  const user = await currentUser();

  return (
    <html lang="fr" className={`${inter.variable} ${bricolage.variable}`}>
      <body>
        <AppShell user={user?.displayName ?? null} authEnabled={isAuthEnabled()}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
