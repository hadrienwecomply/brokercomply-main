# Spec — Suivi du plan d'action (dashboard BrokerComply)

> Modèle figé après 3 rounds de cadrage (2026-06-16). Phase 1 = visuel avec données mockées, sans backend.

## 1. Acteurs & visibilité

- **Officers** : `Sacha`, `Gregory` (compliance officers, ~50 courtiers chacun).
- **Fondateur** : vue globale.
- Pas d'auth en phase 1. UI : tout est visible, **filtre « Mes courtiers » par défaut** (par officer) ; le fondateur a une vue globale.
- Les 44 courtiers réels (`src/data/brokers.seed.json`) sont répartis entre Sacha & Gregory.

## 2. Le plan d'action

Séquence **standard de 13 étapes**, appliquée à **tous** les courtiers (une étape peut être marquée `non_applicable`).

| Code | Étape | SLA proposé (depuis signature) |
|------|-------|-------------------------------|
| 01 | Validation du plan d'action | J+14 |
| 02 | Nomination dans CABRIO | J+21 |
| 03.01 | Remédiation AML | J+60 |
| 03.02 | Recyclage AML | J+90 |
| 04.01 | Remédiation IDD | J+75 |
| 04.02 | Recyclage IDD | J+105 |
| 05.01 | Remédiation RGPD | J+90 |
| 05.02 | Recyclage RGPD | J+120 |
| 06 | Enregistrement goAML | J+45 |
| 07 | Mise en conformité site internet | J+75 |
| 08 | Implémentation AI Act | J+120 |
| 09 | Check Cabrio | J+30 |
| 10 | Plan de redocumentation | J+150 |

> ⚠️ SLA = **valeurs proposées à valider**. La deadline est calculée auto depuis la date de signature et **surchargeable** par l'officer.

**Séquencement** : séquentiel à gate — une étape se débloque quand l'étape applicable précédente est `done`. (01 validation avant toute remédiation, etc.)

**Récurrence** : tout traité en **one-shot** pour le proto (le cycle annuel des « Recyclage » sera ajouté plus tard).

## 3. Sous-étapes (unité atomique de suivi)

Chaque étape contient des **sous-étapes** = ce qu'on coche comme « fait ». Décrites dans Notion pour 01, 02, 03.01 :

- **01 Validation** : 1) Onboarding (e-mail + doc) · 2) Planif réunion validation + rapport conformité · 3) Réunion de validation · 4) Finalisation & envoi rapport.
- **02 CABRIO** : 1) Envoyer process · 2) Monitorer info@we-comply · 3) Valider l'accès (<24h).
- **03.01 Remédiation AML** : 1) Confection des documents · 2) Proposer réunion validation · 3) Suivi & accès SharePoint · 4) Validation & signature.
- **03.02 → 10** : sous-étapes **mockées de façon plausible** (non décrites dans Notion), à raffiner plus tard.

Chaque sous-étape porte : `title`, `status`, et (optionnel) `emailTemplate`, `supports[]` (PDF/liens/vidéos repris de Notion), `actions[]` (libellés).

## 4. Statuts

Clés internes (EN) → **libellés affichés (FR)** :

| Clé | Libellé FR | Couleur | Niveau |
|-----|-----------|---------|--------|
| `not_started` | Pas commencé | gris | sous-étape |
| `in_progress` | En cours | bleu | sous-étape |
| `waiting_client` | En attente client | ambre | sous-étape |
| `blocked` | Bloqué | rouge | sous-étape |
| `done` | Terminé | vert | sous-étape |
| `not_applicable` | Non applicable | neutre | étape |

**Statut d'une étape** (dérivé des sous-étapes) : `non_applicable` si marquée telle ; sinon `done` si toutes faites ; `blocked` si une bloquée ; `in_progress` si au moins une en cours/attente ; sinon `not_started`.

## 5. Calculs

- **Progression courtier** = `sous-étapes done / sous-étapes applicables` (en %) + libellé de l'**étape en cours**.
- **Prochaine action (par courtier)** = 1re sous-étape, dans l'étape active (gate respecté), dont le statut ∈ {`not_started`, `in_progress`, `blocked`} — **on exclut `waiting_client`** (rien à faire côté officer, juste relancer).
- **Vue Actions** = agrégation des prochaines actions de tous les courtiers (filtre « mes courtiers »), triées par urgence/deadline.

## 6. Automatisations (maquette visuelle, non branchée en phase 1)

Priorité :
1. **E-mail onboarding + diagnostic** — bouton « Envoyer l'e-mail d'onboarding » avec modèle Notion + pièce jointe (étape 01).
2. **Relances automatiques** — relance courtier si diagnostic non rempli / pas de réponse depuis X jours (modèles de rappel Notion).

(Alertes SLA et demande de créneaux : plus tard.)

## 7. Modèle de données (mock)

```ts
type StepStatus = 'not_started' | 'in_progress' | 'waiting_client' | 'blocked' | 'done' | 'not_applicable';
type SubStepStatus = Exclude<StepStatus, 'not_applicable'>;

interface Officer { id: string; name: string; role: 'officer' | 'founder'; }

interface Broker {
  id: string; societe: string; contact: string; emails: string[]; countries: string[];
  officerId: string; signatureDate: string; mrr: number; arr: number;
  bce?: string; website?: string; lastContactDate?: string;
  onboardingStatus: string[]; plan: PlanStep[];
}

interface PlanStep {
  code: string;          // '01', '03.01', ...
  title: string;
  applicable: boolean;
  slaDays: number;
  deadline?: string;     // calculée depuis signatureDate, surchargeable
  subSteps: SubStep[];
  // status dérivé
}

interface SubStep {
  id: string; title: string; status: SubStepStatus;
  actions?: string[]; emailTemplate?: { subject: string; body: string };
  supports?: { label: string; type: 'pdf' | 'link' | 'video'; url?: string }[];
}
```

## 8. Hors-scope phase 1

- Backend / persistance / auth.
- Cycle annuel des recyclages.
- Branchement réel des automatisations (envoi e-mail).
- Sous-étapes détaillées des étapes 03.02 → 10 (mockées).
