import { Mail, Bell, Clock, CalendarClock, ArrowRight } from "lucide-react";
import { Card, Eyebrow } from "@/components/ui";

const AUTOMATIONS = [
  {
    icon: Mail,
    title: "E-mail d'onboarding + diagnostic",
    desc: "Envoi automatique de l'e-mail de bienvenue avec le document d'onboarding et le lien du diagnostic de conformité, dès la signature du courtier.",
    trigger: "Déclencheur : courtier signé",
    live: true,
  },
  {
    icon: Bell,
    title: "Relances automatiques",
    desc: "Relance du courtier si le diagnostic n'est pas rempli ou en l'absence de réponse depuis X jours, à partir des modèles de rappel.",
    trigger: "Déclencheur : sans réponse depuis 7 j",
    live: true,
  },
  {
    icon: Clock,
    title: "Alertes deadline / SLA",
    desc: "Notification interne lorsqu'une étape dépasse son SLA ou approche de son échéance.",
    trigger: "À venir",
    live: false,
  },
  {
    icon: CalendarClock,
    title: "Demande de créneaux de réunion",
    desc: "Génération d'un e-mail proposant des créneaux pour les réunions de validation (étapes 01 et 03.01).",
    trigger: "À venir",
    live: false,
  },
];

export default function AutomationsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Eyebrow>Gain de temps</Eyebrow>
        <h1 className="text-3xl font-semibold text-ink">Automatisations</h1>
        <p className="text-ink-soft">
          Faites de la conformité un atout, pas une contrainte. Maquette — les
          actions ne sont pas encore branchées.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {AUTOMATIONS.map((a) => (
          <Card key={a.title} className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                <a.icon className="size-5" />
              </span>
              <span
                className={`rounded-pill px-2.5 py-0.5 text-xs font-medium ${
                  a.live
                    ? "bg-brand-100 text-brand-700"
                    : "bg-line text-st-na"
                }`}
              >
                {a.live ? "Prévu phase 1" : "Plus tard"}
              </span>
            </div>
            <h2 className="text-base font-semibold text-ink">{a.title}</h2>
            <p className="flex-1 text-sm text-ink-soft">{a.desc}</p>
            <div className="flex items-center justify-between border-t border-line pt-3">
              <span className="text-xs text-st-na">{a.trigger}</span>
              <button
                type="button"
                disabled={!a.live}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 disabled:text-st-na"
              >
                Configurer <ArrowRight className="size-3.5" />
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
