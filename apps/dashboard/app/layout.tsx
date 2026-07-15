import type { Metadata } from "next";
import { Inter, Bricolage_Grotesque } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

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
  // Who is signed in (null when the gate is disabled, e.g. local dev).
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = token ? await verifySession(token, Date.now()) : null;

  return (
    <html lang="fr" className={`${inter.variable} ${bricolage.variable}`}>
      <body>
        <AppShell user={user}>{children}</AppShell>
      </body>
    </html>
  );
}
