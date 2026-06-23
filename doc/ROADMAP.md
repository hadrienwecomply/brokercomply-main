# BrokerComply — Roadmap d'optimisation du temps officer

> Document de roadmap (pour relecture / partage). **Aucun code engagé à ce stade.**
> Optique : se mettre dans la peau d'un compliance officer (Sacha / Gregory, ~22 courtiers chacun) et identifier où récupérer du temps.
> Docs voisines : `PRD_KB_Compliance_v1.md` (le quoi/pourquoi), `doc/CONTEXTE_ET_GUIDELINES.md` (le pourquoi des décisions), `PROGRESS_Phase0.md` (état technique).
> Créé : 2026-06-17.

---

## 1. Finalité

Le PRD vise d'abord la **scalabilité** et la **réduction du risque personne-clé** ; le gain de temps est un sous-produit. Ce document prend le gain de temps comme **angle d'entrée** et le décline en features concrètes, tout en restant cohérent avec le moat identifié (le **corpus distillé** des 2 officers) et le white-space concurrentiel (RAG cité + bundle full-service FSMA + FR/NL/EN).

**Priorité retenue pour le détail : Track C (différenciation).** Les autres tracks sont cadrés pour le contexte et le séquencement.

---

## 2. État actuel (résumé)

**Deux surfaces produit coexistent :**

1. **Pipeline KB/RAG** — ingestion Graph → filtre AML → distillation Q/R → recherche hybride. ✅ validé sur vraies données (~26 fiches). ⚠️ **Agent RAG conversationnel (0-F) pas encore construit.**
2. **Dashboard opérationnel** (Next.js) — Portfolio, suivi du **plan d'action 13 étapes**, cockpit `/actions`, onglet **FAQ/KB** (consultation + édition), `/automatisations` (placeholder, mocké).

**Dette structurante connue :** base de test non isolée (les tests effacent la vraie KB), config `mvl@`→`gr@`, couverture Sent Items à systématiser, suivi du plan d'action non persisté (cases à cocher en mémoire).

---

## 3. Où part le temps de l'officer

| Tâche récurrente | Charge | Couvert aujourd'hui |
|---|---|---|
| Répondre à des questions souvent déjà traitées | très élevée | 🟡 KB consultable, pas de réponse rédigée |
| Rédiger emails / rappels / modèles | élevée | 🟡 templates statiques |
| Faire avancer chaque courtier dans les 13 étapes | élevée | ✅ timeline + cockpit (saisie manuelle) |
| **Produire des docs conformité (IDD, AML, RGPD)** | élevée | ❌ rien |
| **Veille réglementaire (nouvelles circulaires FSMA)** | moyenne | ❌ rien (la fraîcheur ne regarde que le passé) |
| **Préparer une inspection FSMA / reporting** | ponctuelle mais lourde | ❌ pas d'export audit-ready |
| Relancer les clients silencieux | moyenne | 🟡 modale mockée |

Les trois lignes en gras sont précisément l'objet du **Track C**.

---

## 4. Vue d'ensemble des tracks

| Track | Intention | Gain de temps | Statut |
|---|---|---|---|
| **0 — Fondations** | Base de test isolée, config officer, backfill Inbox+Sent | indirect (débloque le reste) | bloquant |
| **A — Répondre vite** | Agent RAG cité + brouillon de réponse prêt-à-coller | ⭐⭐⭐ | non commencé |
| **B — Exécuter sans friction** | Envoi réel emails/relances + persistance du suivi | ⭐⭐ | mocké |
| **C — Différenciation** *(priorité)* | Veille réglementaire, export audit FSMA, auto-pull BCE/UBO | ⭐⭐ + défense réglementaire | non commencé |

> Note de séquencement : C apporte de la **défense réglementaire** et de la **différenciation concurrentielle** plus que du gain de temps brut au quotidien (qui est maximal sur le Track A). C est retenu en priorité de cadrage ; voir §6 pour les dépendances réelles avec Track 0 / B.

---

## 5. Track C — Différenciation (détaillé)

Trois chantiers indépendants entre eux. Ordre conseillé : **C2 → C1 → C3** (C2 est le plus autonome et le plus visible côté valeur "inspection-ready").

### C1 — Veille réglementaire « forward-looking »

**Problème officer.** Aujourd'hui la fraîcheur ne fait que flaguer le **périmé** (fiche > 12 mois). L'officer surveille encore *manuellement* les nouvelles circulaires FSMA / publications EIOPA / Moniteur belge pour savoir ce qui impacte ses courtiers. C'est réactif et chronophage.

**Solution.** Un moniteur de changement réglementaire qui :
- récupère les nouvelles publications (FSMA circulaires/communications, EIOPA, Moniteur belge) ;
- les **classe par topic** (AML, fit_and_proper, IDD, EGR, RGPD, AI Act…) via le LLM ;
- les **relie** (a) aux `knowledge_units` impactées et (b) aux courtiers dont une étape du plan d'action touche ce topic ;
- alimente un **fil « Veille »** dans le dashboard + des badges d'alerte sur les fiches et les courtiers concernés.

**Dépendances / intégrations.** Sources externes (RSS / scraping / API si dispo) → consulter la doc à jour via context7 avant de figer la techno d'ingestion. Classification = appel LLM (coût à cadrer). S'appuie sur le vocabulaire `Topic` déjà contrôlé. Bénéficie d'un corpus enrichi (Track 0) pour le mapping fiche↔circulaire.

**Garde-fous.** Sources officielles uniquement ; chaque alerte cite l'URL/date d'origine ; pas d'interprétation automatique poussée comme « action requise » sans revue officer.

**Effort indicatif.** Moyen-élevé (ingestion externe + classification + UI fil + liaisons).

### C2 — Export PDF « audit-ready » FSMA *(à attaquer en premier)*

**Problème officer.** Préparer une inspection FSMA ou produire un état d'avancement par courtier est manuel et lent. C'est aussi un livrable client à valeur (preuve du travail réalisé).

**Solution.** Export PDF par courtier (et batch portefeuille) généré côté serveur :
- les 13 étapes avec statut, deadline, date de réalisation, responsable, pièces ;
- les références réglementaires / fiches KB mobilisées ;
- horodaté, marqué (charte mint `#5fbf99` / Bricolage Grotesque + Inter), prêt inspection.

**Dépendances / intégrations.** Réutilise le modèle de données du plan d'action. Librairie de génération PDF côté serveur (à choisir via context7 — p. ex. génération HTML→PDF). **Dépendance réelle :** pour un export *fidèle*, le suivi doit être persisté (aujourd'hui les statuts sont en mémoire → voir Track B). Un premier export sur données mockées est faisable pour valider le format, mais l'usage réel suppose la persistance.

**Garde-fous.** Horodatage + version ; pas de PII hors périmètre ; cohérent avec la règle « divergences/sources citées ».

**Effort indicatif.** Moyen (faible si on accepte d'abord des données mockées pour figer le gabarit).

### C3 — Auto-pull registres BCE / UBO

**Problème officer.** La production de docs AML exige des recherches manuelles d'identité d'entreprise (BCE/KBO, registre UBO) — saisie répétitive et source d'erreurs.

**Solution.** Intégration des registres BCE (Banque-Carrefour des Entreprises / KBO open data) et UBO pour **pré-remplir** la fiche courtier et les docs AML à partir du numéro d'entreprise.

**Dépendances / intégrations.** Accès aux données BCE/KBO (open data) et conditions d'accès au registre UBO (à vérifier — accès régulé) → context7 / vérification des conditions légales d'accès. Mapping vers le modèle courtier existant.

**Garde-fous.** Données entreprise = sensibles → restent côté serveur ; respect des conditions d'usage du registre UBO ; traçabilité de la source.

**Effort indicatif.** Moyen, **conditionné** à l'accès UBO (peut rester un « best-effort BCE seul » si UBO indisponible).

### Note transverse — Buy-don't-build (rappel benchmark)
Pour le screening AML/KYC/PEP/sanctions : **intégrer un tiers** (ComplyAdvantage / Sumsub…) plutôt que reconstruire. Garder l'IP propriétaire sur la **couche savoir** + la **profondeur FSMA**.

---

## 6. Dépendances & séquencement honnête

- **Track 0 (fondations) reste prioritaire en absolu** : sans base de test isolée, lancer les tests détruit la KB ; sans backfill Inbox+Sent, le corpus reste à ~26 fiches et **C1** (mapping circulaire↔fiches) comme l'agent RAG sous-performent.
- **C2** est le sous-chantier le plus autonome : on peut figer le gabarit PDF sur données mockées **maintenant**, puis le brancher sur les données réelles quand la **persistance du suivi (Track B)** existe.
- **C1** délivre sa pleine valeur une fois le corpus enrichi (Track 0) — sinon les liaisons fiche↔circulaire sont pauvres.
- **C3** est le plus indépendant techniquement, mais **conditionné** par les conditions d'accès au registre UBO.

**Chemin pragmatique proposé :** C2 (gabarit) → Track 0 (fondations) → C1 (veille) → C3 (registres), avec Track B (persistance) intercalé dès que l'export PDF doit refléter le réel.

---

## 7. Risques transverses

- **Qualité du corpus = qualité de tout.** Tout ce qui s'appuie sur la KB (C1, agent) dépend du backfill.
- **Coût LLM** : classification veille (C1) = appels payants → caching + limites.
- **Sources externes fragiles** (C1) : scraping FSMA/Moniteur peut casser → préférer flux officiels, échec isolé non bloquant (cf. guideline robustesse).
- **Accès registre UBO régulé** (C3) : à valider juridiquement avant tout dev.
- **Données entreprise / PII** (C3) : restent côté serveur, hors git (cohérent guidelines confidentialité).

---

## 8. Décisions ouvertes à trancher avant implémentation

1. **C2** : génère-t-on d'abord le gabarit PDF sur données mockées, ou attend-on la persistance (Track B) ?
2. **C1** : quelles sources exactes en v1 (FSMA seul ? + EIOPA ? + Moniteur belge ?) et à quelle fréquence ?
3. **C3** : confirme-t-on l'accès au registre UBO, ou démarre-t-on BCE/KBO seul ?
4. **Arbitrage global** : confirme-t-on que C passe *avant* l'agent RAG (Track A), sachant que A maximise le gain de temps quotidien ?

> Quand une décision est prise, on bascule en mode plan d'implémentation détaillé (restitution besoin → risques → phases → TDD → vérif réel), conformément à la méthode des guidelines.
