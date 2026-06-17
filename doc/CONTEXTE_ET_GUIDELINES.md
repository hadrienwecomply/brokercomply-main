# BrokerComply — Contexte & Guidelines

> Document vivant. But : garder le **pourquoi** des décisions et les **règles de travail**, pour reprendre vite et bien plus tard — sans entrer dans le détail du code.
> Docs voisines : `PRD_KB_Compliance_v1.md` (le quoi/pourquoi produit), `PLAN_Phase0.md` (découpage des tâches), `PROGRESS_Phase0.md` (état technique détaillé).
> Dernière mise à jour : 2026-06-17.

---

## 1. Le projet en une page

BrokerComply (WeComply) capitalise l'expertise de **2 compliance officers** (qui répondent aux questions de conformité de courtiers d'assurance FSMA) en une **base de connaissance recherchable**, servie par un **agent conversationnel** qui cite ses sources.

**Enjeu n°1 : la scalabilité** (servir plus de clients sans recruter), puis la **réduction du risque « personne-clé »**. Le gain de temps est un sous-produit.

**Pipeline** : Emails (Microsoft Graph) → **Filtre AML** → **Distillation LLM** (extraction de fiches Q/R + embeddings) → **Stockage** (Postgres + pgvector) → **Recherche hybride** → **Agent RAG** (à venir) + **Dashboard** (édition/consultation).

**Métrique nord** : nombre de fiches Q/R **capitalisées et à jour**.

**Utilisateurs v1** : 3 internes (2 officers + fondateur). Pas d'accès client, pas d'auth, réseau privé.

---

## 2. Où on en est (haut niveau)

- **Tuyau complet validé en local** : ingestion → AML → distillation → recherche hybride, sur de **vraies données** de la boîte `sdv`.
- **Premier rapport réel** produit : sur ~quelques jours d'emails clients, ~26 fiches Q/R de **bonne qualité** (références réglementaires précises). Signal **encourageant** pour l'hypothèse de valeur.
- **Dashboard** (Next.js) avec un onglet **« Base de connaissances » (FAQ)** : table interactive (filtres, recherche texte + sémantique, provenance) **et édition** des fiches par les officers.
- **Agent RAG conversationnel** : **pas encore construit** (prochaine grosse brique).

---

## 3. Décisions clés & pourquoi (à ne pas redécouvrir)

- **Une seule source de vérité.** La table des fiches est partagée par la distillation, l'agent et le dashboard. Conséquence heureuse : **une édition d'un officer impacte l'agent sans aucune synchro**. Conséquence à surveiller : une mauvaise édition affecte l'agent immédiatement → garde-fous = brouillon/publication, statut de revue, et **citation systématique des sources**.

- **Filtre AML ciblé, pas large.** On exclut le **signalement de soupçon / CTIF**, **pas** toute mention de « blanchiment ». Tout le métier *est* l'anti-blanchiment : un filtre trop large jetterait le contenu le plus précieux. Biais conservateur, mais sur le bon périmètre.

- **Scope « clients signés ».** On ne traite que les correspondances des **44 courtiers signés**, identifiés par **domaine d'entreprise + email exact** (pour les boîtes Gmail). Réduit drastiquement le bruit et le coût.

- **Édition « en place + marquage revu »** (pas d'historique de versions). Plus simple ; une fiche revue/éditée est **protégée** d'un éventuel ré-extrait automatique.

- **Identité sans auth.** Sélecteur d'officer (cookie), identité = email. Pré-câble un futur SSO Microsoft.

- **Re-calcul d'embedding seulement quand la question change.** Éditer une réponse ne coûte aucun appel IA (la recherche par mots-clés se met à jour seule).

- **Officers réels : Sacha (`sdv@`) et Gregory (`gr@`)** + le fondateur. (⚠️ une vieille config mentionne `mvl@` — c'est faux, à corriger.)

---

## 4. Guidelines de travail (le plus important)

1. **⚠️ Base de test séparée — à faire en priorité.** Aujourd'hui les tests d'intégration tournent sur la **base de dev** et **effacent les vraies données** à chaque exécution. Il faut une `TEST_DATABASE_URL` dédiée. Tant que ce n'est pas fait : **lancer la suite de tests détruit la KB** (re-construisible via ré-ingestion + distillation, mais pénible).

2. **Toujours juger sur de vraies données avant de distiller.** Un outil de lecture seule existe pour inspecter de vrais emails (brut vs nettoyé vs pièces jointes vs aperçu AML) **sans rien stocker ni payer**. C'est ce qui a révélé les vrais problèmes (citations accentuées, signatures, AML sur-exclusif).

3. **Conscience du coût IA.** La distillation = **vrais appels payants** par conversation. Pour tester : toujours une **limite** ; un backfill complet est un coût réel à assumer consciemment.

4. **Robustesse « vraies données ».** Le réel surprend : octets parasites dans des emails, erreurs serveur **transitoires** des API. Règle : un échec isolé (une conversation, un email) ne doit **jamais** faire tomber tout un traitement par lot → traiter au cas par cas, compter les échecs, continuer.

5. **Confidentialité technique stricte.** Secrets et vecteurs d'embedding **ne quittent jamais le serveur** ; rien de sensible vers le navigateur. Les données clients (emails, allowlist) restent **hors du dépôt git** (gitignorées) — c'est du local/privé.

6. **Préserver les divergences.** Si deux officers répondent différemment, on **garde les deux** avec attribution (cas d'usage « cohérence entre officers »). Ne pas dédupliquer. Pour que ça marche, il faut ingérer **les boîtes Inbox *et* Sent Items** (sinon on n'a pas les réponses des officers).

7. **Fraîcheur.** Seuil par défaut **12 mois** ; au-delà, une fiche est signalée comme potentiellement périmée. Rééditer/rafraîchir une fiche remet le compteur à zéro.

8. **Méthode** : **planifier d'abord** (restituer le besoin, risques, phases, attendre le go), **trancher les décisions explicitement** (le « grilling » a bien servi), **TDD**, puis **vérifier en réel** (build, rendu, données). Toujours consulter la **doc à jour des librairies** (via context7) avant d'intégrer une techno.

---

## 5. Données, confidentialité & pièges « métier »

- **Allowlist clients = PII** → fichier **gitignoré** (modèle d'exemple committé). Source : la base Notion « Espace clients (signés) ».
- **Pièges de l'allowlist découverts en réel** :
  - un client peut utiliser **plusieurs domaines** (ex. Pearl) → un seul domaine ne suffit pas ;
  - **3 paires de courtiers partagent un même email** (Agreassure/Atrium, FIC/AMK, Tournaisis/Pays Vert) → impossible d'attribuer un thread à **un seul** client par l'email seul (OK pour un rapport global, ambigu par-client) ;
  - **Credit Home n'a pas d'email** → hors scope tant qu'il n'est pas fourni.
- **AML en réel** : de vrais CTIF sont bien exclus ; après resserrement, **0 faux positif** observé. Un email business qui mentionne « blanchiment » en passant n'est plus exclu à tort.
- **Nettoyage des emails** : durci (citations FR accentuées, signatures, disclaimers). Résidu connu : signatures sans délimiteur standard — **bruit faible**, sans impact notable sur la distillation.

---

## 6. Dette connue / à surveiller

1. **Isolation base-de-test** (cf. guideline #1) — le plus urgent.
2. **Config d'ingestion** : le défaut mentionne `mvl@` au lieu de `gr@` — à corriger.
3. **Couverture « réponses officers »** : un premier backfill a ramené surtout des emails entrants → beaucoup de threads « sans Q/R ». Pour le vrai taux de couverture, ingérer **Sent Items** (fait ponctuellement, à systématiser).
4. **Dépendance/coût LLM** : abstraction du fournisseur en place ; rester attentif au coût d'un backfill complet.

---

## 7. Prochaines étapes (backlog)

- **Agent RAG conversationnel** : synthèse avec **citations obligatoires**, dates, **alerte de fraîcheur**, et **présentation des divergences**. C'est la brique qui transforme la KB en produit.
- **Compléter l'édition** : création de fiches manuelles + suppression/archivage.
- **Isolation base-de-test** (priorité).
- **Backfill complet des 2 boîtes** (Inbox + Sent Items) une fois la base-de-test isolée et le nettoyage jugé suffisant.
- **Métriques** : taux de réutilisation, couverture — pour valider l'hypothèse de valeur et décider du passage à l'étape suivante.
- **Gate de production** (rappel PRD) : documenter la clause DPA, figer la règle AML définitive, choisir l'hébergement, et démontrer que l'agent répond utilement à la majorité des recherches.

---

## 8. Où trouver quoi (sans entrer dans le code)

- **Vision produit & règles** : `PRD_KB_Compliance_v1.md`.
- **Plan de tâches** : `PLAN_Phase0.md`.
- **État technique détaillé & décisions d'implémentation** : `PROGRESS_Phase0.md`.
- **Code** : un monorepo avec du **code partagé** (modèle de données, accès LLM, recherche, service KB), un **outil pipeline** (ingestion/AML/distillation) et une **app dashboard** (Next.js).
- **Données locales** (rapports, exports) : dossier `data/` (gitignoré).
- **Mémoire de travail de l'assistant** : `~/.claude/projects/<projet>/memory/` (statuts, leçons, allowlist, etc.).
