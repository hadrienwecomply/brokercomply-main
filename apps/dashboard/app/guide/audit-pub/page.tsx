import Link from "next/link";
import {
  UploadCloud,
  ScanSearch,
  PencilLine,
  FileDown,
  GraduationCap,
  Lightbulb,
  AlertTriangle,
} from "lucide-react";
import { Card, Eyebrow } from "@/components/ui";

/**
 * Static, non-technical user guide for the advertising-compliance audit.
 * Written for the compliance officers: what each line of a constat block
 * means, what happens when they edit something, and the tool's current
 * limits. Pure content page — no data fetching.
 */

export const metadata = {
  title: "Guide — Audit publicité | BrokerComply",
};

// ── Small building blocks ────────────────────────────────────────────────

function Step({
  n,
  icon,
  title,
  children,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          {icon}
        </div>
        <div className="mt-1 w-px flex-1 bg-line" />
      </div>
      <div className="pb-6">
        <p className="text-sm font-semibold text-ink">
          {n}. {title}
        </p>
        <p className="mt-1 text-sm text-ink-soft">{children}</p>
      </div>
    </div>
  );
}

function LevelRow({
  color,
  bg,
  label,
  rule,
}: {
  color: string;
  bg: string;
  label: string;
  rule: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span
        className="mt-0.5 inline-flex shrink-0 items-center rounded-md border border-transparent px-2 py-1 text-xs font-semibold leading-none"
        style={{ color, background: bg }}
      >
        {label}
      </span>
      <p className="text-sm text-ink-soft">{rule}</p>
    </div>
  );
}

/** One annotated line of the mock constat block. */
function FieldExplain({
  label,
  example,
  children,
  italic,
}: {
  label: string;
  example: string;
  children: React.ReactNode;
  italic?: boolean;
}) {
  return (
    <div className="grid gap-2 border-t border-line py-3 sm:grid-cols-2 sm:gap-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</p>
        <p
          className={`mt-1 rounded-md border border-dashed border-brand-500/40 px-2 py-1 text-sm text-ink ${italic ? "italic" : ""}`}
        >
          {example}
        </p>
      </div>
      <p className="text-sm text-ink-soft">{children}</p>
    </div>
  );
}

function ActionRow({
  action,
  effect,
}: {
  action: string;
  effect: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-line px-4 py-3 last:border-0 sm:grid-cols-[220px_1fr] sm:gap-6">
      <p className="text-sm font-semibold text-ink">{action}</p>
      <p className="text-sm text-ink-soft">{effect}</p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function PubAuditGuidePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-2">
        <Eyebrow>Guide</Eyebrow>
        <h1 className="font-display text-3xl font-semibold text-ink">
          L’audit publicité, mode d’emploi
        </h1>
        <p className="text-ink-soft">
          Ce guide explique comment fonctionne l’analyse de conformité des publicités, ce que
          représente chaque ligne d’un constat, et surtout <strong>ce qui se passe quand vous
          modifiez quelque chose</strong> — pour tirer le maximum de l’outil.
        </p>
      </header>

      {/* ── 1. Le parcours ── */}
      <Card className="px-6 py-5">
        <h2 className="mb-4 font-display text-lg font-semibold text-ink">
          Le parcours en 5 étapes
        </h2>
        <Step n={1} icon={<UploadCloud className="size-4" />} title="Importer">
          Depuis la fiche d’un courtier, onglet « Audit publicité » : importez une ou plusieurs
          images (PNG, JPEG, WebP). Chaque visuel est analysé séparément. Ajoutez si possible le
          texte d’accompagnement et l’URL de la landing page — voir plus bas pourquoi.
        </Step>
        <Step n={2} icon={<ScanSearch className="size-4" />} title="Analyse automatique">
          L’IA lit la pub (texte, visuel, mentions) et passe en revue une grille d’une
          cinquantaine de points de contrôle issus du guide Do &amp; Don’t (FSMA / Code de droit
          économique). Pour chaque point applicable, elle rend un verdict avec la citation exacte
          qui le justifie. Le niveau global (rouge / orange / jaune / vert) est ensuite calculé
          par une règle fixe — jamais « à l’intuition » de l’IA.
        </Step>
        <Step n={3} icon={<PencilLine className="size-4" />} title="Relecture (votre rôle clé)">
          Cliquez sur « Relecture » : le rapport s’ouvre avec la pub épinglée à gauche et tous
          les constats à droite. Tout est modifiable : verdicts, citations, explications,
          reformulations. C’est vous qui avez le dernier mot, pas l’IA.
        </Step>
        <Step n={4} icon={<FileDown className="size-4" />} title="Générer le PDF">
          Le bouton « Générer le PDF » produit le rapport final aux couleurs du courtier.
          Important : <strong>le PDF liste les non-conformités et les points d’attention</strong>,
          au même titre. Les points conformes et non applicables n’y figurent pas.
        </Step>
        <Step n={5} icon={<GraduationCap className="size-4" />} title="L’outil apprend de vous">
          Au moment de la génération du PDF, vos corrections (verdicts retournés, reformulations
          réécrites) sont mémorisées et réinjectées dans les analyses suivantes. Plus vous
          corrigez proprement, plus les prochains audits sont justes — pour tout le cabinet.
        </Step>
      </Card>

      {/* ── 2. Le niveau global ── */}
      <Card className="px-6 py-5">
        <h2 className="mb-2 font-display text-lg font-semibold text-ink">Le niveau global</h2>
        <p className="mb-3 text-sm text-ink-soft">
          Il est déterminé automatiquement à partir des verdicts, dans cet ordre de priorité :
        </p>
        <div className="divide-y divide-line">
          <LevelRow
            color="#bb1626"
            bg="#fde2e5"
            label="Rouge — Non conforme"
            rule="Au moins une interdiction est enfreinte (ex. promesse de crédit garanti). Ne pas diffuser en l’état."
          />
          <LevelRow
            color="#8a5300"
            bg="#fdf1da"
            label="Orange — À compléter"
            rule="Pas d’interdiction enfreinte, mais des mentions obligatoires manquent (ex. avertissement légal, identité de l’intermédiaire)."
          />
          <LevelRow
            color="#4b5159"
            bg="#eef0f2"
            label="Jaune — Sous réserve"
            rule="Rien de non conforme, mais certains points restent des « points d’attention » (l’élément peut se trouver ailleurs : landing page, profil du réseau social…)."
          />
          <LevelRow
            color="#1f7a44"
            bg="#e7f4ec"
            label="Vert — Aucun constat"
            rule="Aucune non-conformité ni point d’attention."
          />
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          Conséquence directe : <strong>quand vous changez un verdict dans la relecture, le
          niveau global et les compteurs se recalculent automatiquement</strong> selon ces mêmes
          règles. Corriger un seul « non conforme » à tort peut faire passer une pub du rouge au
          vert — d’où l’importance de la relecture.
        </p>
      </Card>

      {/* ── 3. Anatomie d'un bloc ── */}
      <Card className="px-6 py-5">
        <h2 className="mb-2 font-display text-lg font-semibold text-ink">
          Anatomie d’un bloc de constat
        </h2>
        <p className="mb-4 text-sm text-ink-soft">
          Chaque point de contrôle apparaît comme un bloc dans le rapport de relecture. Toutes
          les zones encadrées en pointillé sont modifiables directement (cliquez dans le texte).
          Voici ce que chaque ligne représente :
        </p>

        <FieldExplain
          label="Titre du constat"
          example="2.3 Absence de promesse de rapidité — C4"
        >
          Le point de contrôle vérifié, avec son code interne (G = général, C = crédit,
          H = hypothécaire, A = assurance). Le titre vient de la grille légale et n’est pas
          modifiable : c’est le référentiel commun à tous les audits.
        </FieldExplain>

        <FieldExplain label="Verdict (menu déroulant)" example="Non conforme ▾">
          Le jugement porté sur ce point : <strong>Non conforme</strong> (rouge),{" "}
          <strong>Point d’attention</strong> (l’IA n’a pas pu trancher avec les éléments fournis),{" "}
          <strong>Conforme</strong>, ou <strong>Non applicable</strong> (le point ne concerne
          pas ce type de pub). C’est la ligne la plus importante du bloc : elle pilote le niveau
          global et l’apparition du constat dans le PDF final.
        </FieldExplain>

        <FieldExplain
          label="Base légale (étiquette grise)"
          example="Art. VII.65 CDE"
        >
          L’article de loi ou la source réglementaire qui fonde le contrôle. Informative, non
          modifiable.
        </FieldExplain>

        <FieldExplain
          label="Citation / constat"
          example="« Votre crédit accepté en 24h ! »"
          italic
        >
          La preuve : le passage exact de la pub qui justifie le verdict, ou un constat
          d’absence (« aucune mention du taux »). Si la citation ne correspond pas à ce que dit
          réellement la pub, c’est le signe que l’IA s’est trompée — corrigez le verdict.
        </FieldExplain>

        <FieldExplain
          label="Explication"
          example="La promesse d’un délai d’acceptation est interdite pour le crédit à la consommation."
        >
          Pourquoi c’est un problème (ou pas), en langage clair. Ce texte apparaît dans le PDF
          remis au courtier : reformulez-le librement si vous voulez adoucir ou préciser.
        </FieldExplain>

        <FieldExplain
          label="Reformulation proposée"
          example="« Réponse de principe rapide, sous réserve d’acceptation du dossier. »"
        >
          La correction prête à l’emploi que le courtier peut reprendre telle quelle. Si vous la
          réécrivez, votre version part dans le PDF <strong>et</strong> l’outil la retient : les
          reformulations que vous réécrivez souvent vous seront proposées « à promouvoir » dans
          la Configuration, pour être suggérées automatiquement dans les audits suivants.
        </FieldExplain>

        <FieldExplain
          label="Emplacement à vérifier"
          example="Légende du post ou page de destination"
        >
          Pour les verdicts « Point d’attention » : où la mention manquante a le droit de se trouver
          (texte d’accompagnement, profil, landing page…). Aide le courtier — et vous — à savoir
          quoi contrôler avant de valider.
        </FieldExplain>

        <FieldExplain
          label="Commentaire"
          example="Vérifié avec le courtier : la mention figure bien sur la landing."
        >
          Votre note libre sur ce constat. Attention : elle est <strong>visible dans le
          rapport</strong> remis au courtier (contrairement à la « raison de la correction »
          ci-dessous).
        </FieldExplain>

        <FieldExplain
          label="Raison de la correction (n’apparaît que si vous changez le verdict)"
          example="Le label « Sponsorisé » d’Instagram vaut identification publicitaire."
        >
          Quand vous corrigez un verdict de l’IA, une case supplémentaire apparaît pour noter
          <em> pourquoi</em>. Elle est <strong>strictement interne</strong> — jamais dans le
          PDF — et sert à nourrir l’apprentissage : bien remplie, elle évite que l’IA refasse la
          même erreur sur les prochaines pubs.
        </FieldExplain>
      </Card>

      {/* ── 4. Actions et conséquences ── */}
      <Card className="overflow-hidden">
        <div className="border-b border-line bg-paper px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-ink">
            Vos actions et leurs conséquences
          </h2>
        </div>
        <ActionRow
          action="Changer un verdict"
          effect={
            <>
              Le niveau global et les compteurs se recalculent. Une case « Raison de la
              correction » apparaît (interne, jamais dans le PDF). Votre correction est mémorisée
              à la génération du PDF et sert d’exemple aux analyses suivantes.
            </>
          }
        />
        <ActionRow
          action="Réécrire une explication ou une citation"
          effect="Le texte modifié remplace celui de l’IA dans le PDF final. La citation doit rester fidèle à la pub : c’est la preuve du constat."
        />
        <ActionRow
          action="Réécrire une reformulation"
          effect="Votre version part dans le PDF. Si le même type de réécriture revient plusieurs fois, elle vous sera proposée « à promouvoir » dans Configuration → Audit pub, pour devenir une suggestion automatique."
        />
        <ActionRow
          action="Bouton « Enregistrer »"
          effect="Sauvegarde vos modifications sur le serveur : le statut passe à « Relu » et un collègue qui ouvre la relecture voit vos corrections. Sans Enregistrer, le brouillon ne vit que dans votre navigateur."
        />
        <ActionRow
          action="Bouton « Générer le PDF »"
          effect={
            <>
              Applique vos corrections, mémorise vos retours pour l’apprentissage, puis produit
              le PDF final aux couleurs du courtier. <strong>Seuls les constats « Non
              conforme » y figurent</strong> — vérifiez donc les verdicts avant de générer.
            </>
          }
        />
        <ActionRow
          action="Bouton « Relancer »"
          effect={
            <>
              Relance une analyse complète de l’image, comme si c’était la première fois.{" "}
              <strong>Les corrections faites sur l’ancienne analyse sont effacées</strong> (elles
              portaient sur des constats qui n’existent plus). À utiliser quand l’analyse a
              échoué ou est restée bloquée — pas pour « rafraîchir » un rapport déjà corrigé.
            </>
          }
        />
        <ActionRow
          action="Ajouter une consigne dans Configuration → Audit pub"
          effect="La consigne d’interprétation (ex. « tolérer “simulation en ligne” ») est appliquée à toutes les analyses futures, pour tous les courtiers et les deux officers. La grille légale elle-même n’est pas modifiable."
        />
        <ActionRow
          action="Promouvoir une reformulation"
          effect="Elle rejoint la bibliothèque des formulations approuvées : l’IA la proposera en priorité quand le même constat reviendra."
        />
      </Card>

      {/* ── 5. Bien démarrer ── */}
      <Card className="px-6 py-5">
        <div className="mb-2 flex items-center gap-2">
          <Lightbulb className="size-5 text-brand-600" />
          <h2 className="font-display text-lg font-semibold text-ink">
            Le bon réflexe : donner du contexte dès l’import
          </h2>
        </div>
        <p className="text-sm text-ink-soft">
          Beaucoup de mentions obligatoires ont le droit de se trouver <em>en dehors</em> du
          visuel : dans la légende du post, sur la page de destination… Si vous n’importez que
          l’image, l’IA ne peut pas le savoir et classera honnêtement ces points « Point d’attention ».
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
          <li>
            <strong className="text-ink">Texte d’accompagnement</strong> : collez la légende du
            post ou le corps de l’email. L’IA le lit comme faisant partie de la pub.
          </li>
          <li>
            <strong className="text-ink">URL de la landing page</strong> : la page est récupérée
            et analysée avec le visuel. Une mention présente sur la landing peut faire passer un
            point de « Point d’attention » à « Conforme ».
          </li>
        </ul>
        <p className="mt-3 text-sm text-ink-soft">
          Résultat : moins de faux points d’attention, moins de corrections manuelles, un rapport
          plus proche du définitif dès la première analyse.
        </p>
      </Card>

      {/* ── 6. Limites actuelles ── */}
      <Card className="px-6 py-5">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="size-5 text-[#8a5300]" />
          <h2 className="font-display text-lg font-semibold text-ink">Limites actuelles</h2>
        </div>
        <ul className="list-disc space-y-2 pl-5 text-sm text-ink-soft">
          <li>
            <strong className="text-ink">Images fixes uniquement.</strong> Pas encore de vidéos
            ni de carrousels animés (prévu dans une V2). Formats acceptés : PNG, JPEG, WebP ;
            les fichiers trop volumineux ou dans un autre format sont ignorés à l’import.
          </li>
          <li>
            <strong className="text-ink">L’IA peut se tromper.</strong> Elle peut mal lire un
            texte stylisé, rater une mention en petits caractères ou être trop sévère. La
            relecture humaine n’est pas optionnelle : aucun PDF ne devrait partir sans avoir été
            relu. Vérifiez toujours que la citation correspond bien à la pub.
          </li>
          <li>
            <strong className="text-ink">Un point non analysé devient « Point d’attention ».</strong>{" "}
            Quand l’IA n’a pas pu examiner un point applicable, elle le marque honnêtement
            « Point d’attention » plutôt que d’inventer un verdict. Un rapport avec beaucoup de
            points d’attention signifie souvent qu’il manquait du contexte à l’import.
          </li>
          <li>
            <strong className="text-ink">
              Le PDF reprend les points d’attention au même titre que les non-conformités.
            </strong>{" "}
            Une pub « jaune » (uniquement des points d’attention) produit donc bien un rapport
            détaillé. Relisez-les avec la même attention que les non-conformités : ils partent
            tels quels chez le courtier.
          </li>
          <li>
            <strong className="text-ink">L’apprentissage est commun au cabinet.</strong> Les
            corrections et consignes s’appliquent à tous les courtiers — il n’y a pas (encore)
            de règles propres à un courtier donné.
          </li>
          <li>
            <strong className="text-ink">La landing page est lue au moment de l’analyse.</strong>{" "}
            Si elle change ensuite, le rapport ne s’en rend pas compte. Certaines pages
            protégées ou trop lentes peuvent aussi ne pas être récupérables.
          </li>
          <li>
            <strong className="text-ink">Analyse informative, pas un avis juridique.</strong>{" "}
            L’audit se fonde sur le guide Do &amp; Don’t Brokercomply ; la FSMA ou le SPF
            Économie peuvent avoir une lecture différente. En cas de doute, tranchez en interne.
          </li>
        </ul>
      </Card>

      <p className="pb-4 text-center text-sm text-ink-soft">
        Une question, un cas limite, une erreur récurrente de l’analyse ? Ajoutez une consigne
        dans{" "}
        <Link href="/config/pub" className="font-medium text-brand-700 underline">
          Configuration → Audit pub
        </Link>{" "}
        ou signalez-le à l’équipe.
      </p>
    </div>
  );
}
