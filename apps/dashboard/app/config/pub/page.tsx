import Link from "next/link";
import { Eyebrow } from "@/components/ui";
import { getPubGuidanceConfig } from "@/lib/pub-guidance.server";
import { PubGuidanceWorkspace } from "@/components/pub-guidance-workspace";

export const dynamic = "force-dynamic";

export default async function PubConfigPage() {
  const config = await getPubGuidanceConfig();
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Eyebrow>Administration</Eyebrow>
        <h1 className="text-3xl font-semibold text-ink">Configuration de l&apos;audit pub</h1>
        <p className="text-ink-soft">
          Définissez les reformulations approuvées et les consignes d&apos;interprétation par check. Elles
          orientent l&apos;analyse des prochaines pubs, sans toucher à la grille légale (code).
        </p>
        <nav className="flex gap-1 border-b border-line pt-2">
          <Link href="/config" className="px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink">
            Plan d&apos;action
          </Link>
          <span className="border-b-2 border-brand-600 px-3 py-2 text-sm font-semibold text-ink">Audit pub</span>
        </nav>
      </header>
      <PubGuidanceWorkspace config={config} />
    </div>
  );
}
