---
title: Feature Plan — Emails par courtier (lecture + envoi de templates)
status: in-progress
branch: feat/email_implementation
started: 2026-06-24
---

# FP — Emails par courtier

Onglet « Conversations » par courtier (lecture des derniers échanges email) + envoi
d'emails template depuis une étape du plan d'action, via Microsoft Graph.

## Décisions verrouillées (grilling 2026-06-24)

| # | Sujet | Décision |
|---|---|---|
| 1 | Source lecture | Réutiliser `source_documents` (AML-safe, pas de nouveau scope) |
| 2 | Identité d'envoi | **From = officer assigné au courtier (`broker.accountOwner`)**, fallback Sacha (`DEFAULT_OFFICER`) — *révisé 2026-06-24, ex-boîte partagée conformite@* |
| 3 | Matching | Email exact prioritaire + domaine opt-in non-public |
| 4 | Fraîcheur | Delta sync + cron Heroku + refresh à la demande par courtier |
| 5 | Boucle réponse | From=officer → les réponses reviennent naturellement à l'officer (**plus de Reply-To** ; sauf mode test) |
| 6 | Rendu | `bodyClean` in-app + lien « Ouvrir dans Outlook » (`webLink`) |
| 7 | Multilingue | FR uniquement en v1 |
| 8 | Variables | Auto-remplissage liste blanche + aperçu éditable |
| 9 | Accès envoi | Sélecteur d'identité officer (déjà existant: `OFFICER_COOKIE`) + audit (`sent_by_officer`) |
| 10 | Destinataires | To = email principal courtier, **pas de CC par défaut** (From=officer rend le CC redondant) |
| 16 | Garde-fou test | Hors prod (ou `MAIL_REDIRECT_TO`) → tout part vers `hr@we-comply.be`, destinataires réels dans le corps |
| 11 | Pièces jointes | Liens dans le corps, pas de binaire (v1) |
| 12 | Format | Texte brut |
| 13 | Anti-doublon | Badge « envoyé le X » + avertissement doux |
| 14 | Opt-in domaine | Champ `matchDomains` + toggle UI + blocklist publique |
| 15 | Refresh à la demande | Doit passer par le filtre AML avant stockage/affichage |

## Impacts

- **Schema** : `brokers.matchDomains` (jsonb, fait) ; `source_documents.webLink` (P1.5) ;
  table `outbound_emails` (P4) ; persistance `deltaToken` (P1.5).
- **Migrations** : `0006_little_nicolaos.sql` (match_domains) — fait.
- **Shared** : `packages/shared/src/conversations/` (addresses + service) — fait.
- **Dashboard** : sous-onglet `/courtiers/[id]/conversations`, composant d'envoi sur step-panel.
- **Graph** : `Mail.Send` (app-only) + Application Access Policy (IT).

## Phases

- **P0 — Habilitations (IT, bloque seulement P4)** : créer `conformite@`, scope `Mail.Send`,
  consentement admin, Application Access Policy restreignant l'app à cette boîte.
- **P1 — Backend lecture** ✅ : `resolveBrokerAddresses` + `getBrokerConversations`,
  migration `matchDomains`, 19 tests verts.
- **P1.5 — Delta sync + fraîcheur** : `/messages/delta` + token persisté, `webLink` au
  `$select`, Heroku Scheduler, refresh à la demande (via pipeline AML).
- **P2 — Onglet Conversations** : sous-onglet, liste/détail de fils, badge date, lien Outlook.
- **P3 — Templates** : réutiliser les 6 `emailTemplate`, en ajouter, moteur d'interpolation.
- **P4 — Envoi** : `sendMail`, Server Action `sendStepEmail` (aperçu→envoi→log),
  table `outbound_emails`, badge « envoyé le X ».
- **P5 (v2)** : webhooks, pièces jointes binaires, HTML riche, NL/EN.

## Critères de succès

- Les conversations d'un courtier (exact + domaine opt-in) s'affichent, AML exclu, internal exclu.
- L'envoi d'un template part de `conformite@`, Reply-To officer, CC officer, et est tracé.
- Aucun contenu CTIF n'atteint jamais l'UI (filtre AML en amont, y compris refresh à la demande).

## Journal d'exécution

- **2026-06-24** — Plan validé + grilling (15 décisions). P1 implémentée en TDD :
  module `conversations` (matching pur + service DB), colonne `matchDomains`,
  migration 0006, 19 tests verts, build + lint OK.
- **2026-06-24 (suite, "enchaîne tout")** — P1.5 → P4 implémentées :
  - **P1.5** : `webLink` bout-en-bout (ingestion `$select` + `rawMetadata`) ;
    delta sync (`GraphEmailClient.listMessagesDelta`, table `mail_sync_state`,
    `runDeltaIngest`, script `ingest:delta` pour Heroku Scheduler) ; refactor
    `processMessages` partagé backfill/delta. Migration 0007. 2 tests delta + 61
    tests d'ingestion verts.
  - **P2** : onglet **Conversations** (`/courtiers/[id]/conversations`),
    `conversations.server.ts` + `ConversationsTab` (master-détail, badge
    fraîcheur, lien Outlook, badges pièces jointes, états vides) ; toggle domaine
    opt-in (`matchDomains` + `setMatchDomains` action, garde anti-domaine-public).
  - **P3** : moteur d'interpolation `templates/renderTemplate` (shared, 6 tests) +
    builder client `email-draft.ts` (auto-fill `[Prénom]/[Société]/[Échéance]`).
  - **P4** : table `outbound_emails` (migration 0008), `GraphMailClient.sendMail`
    (shared), service log/list, `MAIL_SENDER` config, `mail.server.ts` +
    `mail-actions.ts` (Reply-To=accountOwner, CC=officer, identité officer cookie),
    `SendEmailModal` (aperçu éditable, avertissement renvoi, badge « envoyé le X »).
  - **Total : 182 tests verts**, build + typecheck dashboard + lint OK.
  - **Reste P0 (IT, bloque l'envoi réel)** : créer `conformite@we-comply.be`,
    scope `Mail.Send` + consentement admin, Application Access Policy.
  - **Gap connu** : le refresh « à la demande » côté UI ne fait que recharger la
    vue (revalidate) ; le pull Graph à la demande franchirait la frontière
    dashboard↔kb-compliance — la fraîcheur de fond est assurée par le cron delta.
- **2026-06-24 (révision identité d'envoi)** — Pivot : From = officer assigné
  (`broker.accountOwner`, fallback Sacha) au lieu de la boîte partagée. Conséquences :
  `MAIL_SENDER` supprimé ; `Reply-To` retiré (sauf mode test) ; CC par défaut retiré ;
  `isMailSendConfigured` n'exige plus que les AZURE_*. Ajout du garde-fou test
  `MAIL_REDIRECT_TO`/hors-prod → `hr@we-comply.be`. **Impact IT** : l'Application
  Access Policy doit autoriser les **boîtes officers** (sdv@, mvl@/gr@…), plus
  conformite@. Build + typecheck + lint + 182 tests verts.
