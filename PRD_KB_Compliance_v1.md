# PRD — Moteur de capitalisation & agent conversationnel compliance (v1)

**Statut :** Brouillon pour relecture
**Date :** 16 juin 2026
**Porteur :** Hadrien (WeComply / Broker-Comply)
**Méthode :** rédigé en atelier interactif, décisions validées section par section

---

## 1. Contexte & problème

WeComply commercialise l'expertise de ses compliance officers (un associé, un employé) auprès d'intermédiaires d'assurance régulés FSMA et d'agents immobiliers soumis aux obligations AML. Le modèle repose aujourd'hui entièrement sur le temps de deux personnes, ce qui **plafonne la capacité** à servir plus de clients et crée un **risque « personne-clé »** fort.

Le savoir produit (interprétations réglementaires, marches à suivre) se matérialise dans ~20–50 échanges email par semaine, mais reste enfermé dans des boîtes individuelles : non capitalisé, non recherchable, non transmissible. Les officers en portent la charge en premier.

**Enjeu prioritaire : la scalabilité** (servir plus sans recruter), puis la **capitalisation** (réduire le risque personne-clé). Le gain de temps sur les questions répétées n'est qu'un sous-produit.

---

## 2. Objectifs & hypothèse de valeur

**Objectif** : transformer le savoir des compliance officers en une base de connaissance recherchable, fiable et **maintenue à jour**, au service de la scalabilité et de la réduction du risque personne-clé.

**Hypothèse de valeur** (assumée à ce stade, instrumentée par le v1 lui-même) : une part suffisante des questions clients est généralisable et réutilisable.

**Métrique nord** : couverture = nombre de paires Q/R capitalisées **et à jour** dans la KB.

**Métriques secondaires** :
- Adoption : usage spontané des officers.
- Taux de réutilisation : part des recherches qui retrouvent une réponse déjà traitée (mesuré une fois le v1 en place — sert aussi à valider l'hypothèse de valeur).

**Critère de passage au v2** (draft automatique dans Outlook) : la KB répond utilement à la majorité des recherches.

**Contrainte de temps** : pas de deadline — la qualité et la conformité priment sur la vitesse.

---

## 3. Utilisateurs & cas d'usage

**Utilisateurs v1** : les 2 compliance officers + le fondateur (3 personnes).

**Surface** : un agent conversationnel — on interroge la KB en langage naturel, l'agent répond en citant ses sources.

**Cas d'usage** :
- Avant de répondre à un client : « a-t-on déjà traité cette question ? »
- Vérifier la cohérence des réponses entre les deux officers.
- Recherche ponctuelle ad hoc.

**Hors périmètre v1** : onboarding de nouveaux arrivants, accès clients, draft automatique de réponses.

---

## 4. Périmètre données & gouvernance

| Élément | Décision |
|---|---|
| Périmètre d'ingestion | Les boîtes mail des **2 compliance officers uniquement** |
| Base légale | Couverte par les DPA clients existants — *action : documenter la clause précise (audit trail)* |
| Exclusion AML | Tout contenu lié aux déclarations de soupçon / CTIF est **exclu** de l'ingestion (filtre conservateur en amont) |
| Stockage | Contexte client conservé **en brut** ; accès **identique aux 3** utilisateurs ; pas de journal d'audit en v1 |
| Garde-fou anti-fuite | L'agent **cite systématiquement ses sources** → tout emprunt à un autre dossier client reste visible et vérifiable |
| Rétention | Conservation tant que l'entrée reste pertinente, avec **revue de fraîcheur périodique** |

---

## 5. Fonctionnalités v1

**Construction de la KB** : extraction **100 % automatique** des paires Q/R depuis les emails, **sans validation humaine** (décision assumée — voir risque **R1**). Filtre d'exclusion AML/CTIF **conservateur** en amont (biais « en cas de doute, exclure »).

**Réponse de l'agent**, qui doit contenir :
- une synthèse en langage naturel ;
- les emails / sources cités ;
- la date de la réponse d'origine ;
- une alerte automatique si la source est potentiellement périmée.

**Maintien de la fraîcheur** : l'agent flague automatiquement les entrées au-delà d'un seuil (**défaut 12 mois, configurable** selon le rythme des circulaires FSMA).

---

## 6. Architecture technique

Implémentation en **TypeScript / Node**, accès email en **app-only** via l'application Microsoft Entra déjà enregistrée (permission `Mail.Read`, consentement admin accordé).

**Pipeline :**

1. **Ingestion** — lecture des 2 boîtes officers via Microsoft Graph.
   - *Phase 0* : backfill de l'historique complet (pagination Graph, gestion des limites de débit).
   - *Régime permanent* : synchronisation incrémentale quotidienne (delta).
   - Reconstruction des threads (nettoyage citations / signatures), gestion des pièces jointes, multilingue FR/NL/EN.
2. **Filtre AML** conservateur (exclusion CTIF / déclarations de soupçon) **avant** tout stockage.
3. **Distillation** — extraction LLM des connaissances vers des **fiches canoniques** (cf. modèle de données), chacune reliée à ses emails sources. **Embedding multilingue** FR/NL/EN.
4. **Stockage** — modèle à deux couches sur Postgres + `pgvector` (détaillé ci-dessous), sans nouvelle dépendance d'infra.
5. **Agent RAG conversationnel** : **recherche hybride** (sémantique + lexicale), synthèse LLM avec citations, dates et alertes de fraîcheur ; **préservation et signalement des divergences** entre officers.

**LLM** : API managée (Claude ou OpenAI), **no-training activé**, région UE si disponible, **sous DPA**.

### Modèle de données (le cœur du système)

Architecture à **deux couches** :

**Couche 1 — Dépôt de sources** (`source_documents`) : emails nettoyés (threads reconstitués, signatures/citations retirées) + texte des pièces jointes + métadonnées (boîte, date, expéditeur, langue, message-id). Enregistrement **immuable**, sert uniquement à la traçabilité et à la citation. Le contenu AML/CTIF n'y entre **jamais** — seul un compteur d'exclusions est conservé, sans contenu.

**Couche 2 — Dépôt de savoir** (`knowledge_units`) : les fiches distillées, **embeddées et interrogées**, pointant vers la couche 1.

```sql
CREATE TABLE knowledge_units (
  id              uuid PRIMARY KEY,
  question        text NOT NULL,        -- formulation canonique
  answer          text NOT NULL,        -- réponse synthétisée
  topic           text,                 -- AMLR, fit_and_proper, EGR, mystery_shopping…
  regulatory_refs jsonb,                -- ["Circ. FSMA 2023_12", "Loi 18/09/2017 art. 35"]
  language        text,                 -- fr / nl / en
  source_ids      uuid[],               -- → source_documents (couche 1)
  source_date     date,                 -- date de la réponse d'origine → pilote la fraîcheur
  author          text,                 -- quel officer → sert la détection d'incohérence
  confidence      real,                 -- confiance d'extraction
  embedding       vector(1536),         -- embedding multilingue de la question
  created_at      timestamptz,
  updated_at      timestamptz
);
```

**Recherche : hybride.** Similarité vectorielle (pgvector / HNSW) **+** plein-texte (`tsvector` natif Postgres) pour capter les références réglementaires exactes (numéros de circulaire, articles) que les embeddings sémantiques flouteraient. Filtres SQL sur `topic`, `language`, `source_date` dans la même table — avantage clé de pgvector sur une base vectorielle séparée.

**Doublons / divergences.** Pas de déduplication agressive : les réponses divergentes (surtout entre auteurs différents) sont **remontées ensemble et signalées**, au service du cas d'usage « cohérence entre officers ».

---

## 7. Exigences non-fonctionnelles

- **Authentification** : aucune auth applicative en v1 → l'app **doit être déployée sur un réseau privé / non exposée publiquement**. Le SSO Microsoft Entra est un ajout simple à prévoir en backlog.
- **Confidentialité fournisseur LLM** : DPA signé + option no-training, région UE si disponible.
- **Chiffrement** : au repos et en transit (standard).
- **Performance** : volume faible (20–50 échanges/sem) → pas de contrainte de latence forte. Le backfill est un traitement batch ponctuel.
- **Disponibilité** : outil interne, pas de SLA critique.
- **Traçabilité** : pas d'audit des requêtes en v1 (ajout possible ultérieurement).

---

## 8. Risques & mitigations

| # | Risque | Niveau | Mitigation |
|---|---|---|---|
| **R1** | Extraction 100 % auto sans validation → entrées fausses, obsolètes ou AML non filtrées entrant dans la KB | Élevé — **accepté par le porteur** | Filtre AML conservateur ; agent qui cite ses sources + alerte de fraîcheur ; décision réversible (un gate humain reste ajoutable) |
| **R2** | Fuite inter-clients via le stockage brut (détails d'un client A ressortant pour un client B) | Élevé | Citation systématique des sources rendant l'emprunt visible ; accès limité à 3 internes ayant déjà accès aux boîtes |
| **R3** | Hypothèse de valeur (répétition / réutilisabilité) non prouvée | Moyen | Le v1 instrumente le taux de réutilisation ; décision go/no-go v2 basée sur cette donnée |
| **R4** | Savoir périmé donné comme actuel | Moyen | Flag de fraîcheur > 12 mois + revue périodique |
| **R5** | Qualité de la source email (threads, pièces jointes, multilingue) | Moyen | Nettoyage des threads, parsing des pièces jointes, modèle multilingue |
| **R6** | Absence d'auth → exposition si le réseau est mal cloisonné | Moyen | Déploiement réseau privé strict ; SSO Entra en backlog |
| **R7** | Adoption : ressenti de « surveillance » côté officers | Faible/Moyen | Cadrage « augmentation » et transparence ; les officers sont utilisateurs du v1 |
| **R8** | Dépendance / coûts du fournisseur LLM | Faible | Abstraction de la couche provider |

---

## 9. Roadmap / phasage

- **Phase 0 — Prototype local** : construire et valider le pipeline en local (backfill Graph, extraction Q/R, embeddings, agent RAG) sur un **échantillon réduit**. Aucune dépendance à l'hébergement ni à la paperasse conformité. Le filtre AML est présent dès cette phase sous forme de **garde-fou conservateur de base** (la règle définitive, elle, est figée au gate de production).
- **Phase 1 — KB sur les 2 boîtes** : backfill de l'historique complet + extraction Q/R + embeddings (`pgvector`), en environnement contrôlé.
- **Phase 2 — Agent conversationnel** : interface chat, RAG avec citations / dates / alertes de fraîcheur.
- **Phase 3 — Exploitation** : passage au delta quotidien, revue de fraîcheur, mesure de la couverture et du taux de réutilisation.
- **Gate de mise en production / v2** — prérequis **bloquants** avant tout déploiement réel et avant le draft auto Outlook :
  1. documenter la clause DPA (base légale) ;
  2. figer la règle d'exclusion AML définitive ;
  3. choisir l'hébergement ;
  4. *(déclencheur produit)* l'agent répond utilement à la majorité des recherches.

---

## 10. Prérequis & questions ouvertes

1. **Hébergement** : à définir (proposition par défaut : Heroku, cohérent avec l'infra existante).
2. **Clause DPA** : identifier et documenter la clause couvrant ce traitement secondaire.
3. **Règle d'exclusion AML** : définir précisément (mots-clés, modèle de détection, seuil de prudence).
4. **Seuil de fraîcheur X** : confirmer (défaut proposé : 12 mois).
5. **Fournisseur LLM** : trancher Claude vs OpenAI, signer le DPA, activer no-training.
6. **Liste des 2 boîtes officers** : à fournir (configuration de l'ingestion).
7. **Cloisonnement réseau** : garantir le déploiement privé (puisque pas d'auth en v1).
8. **Données du prototype local** : décider sur quoi tester en Phase 0 — un échantillon réduit (idéalement la propre boîte du fondateur ou des données synthétiques) est préférable à un backfill complet de données clients réelles sur une machine locale. Si le prototype pointe vers des boîtes réelles, le garde-fou AML de base doit être actif.
