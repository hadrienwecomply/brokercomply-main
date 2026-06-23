/**
 * Seed cards for the roadmap board, derived from ROADMAP_Phase1.md (the 3-month
 * "industrialiser le delivery" plan) plus idea-stage items from the competitive
 * benchmark. Used once to populate an empty board; afterwards the team edits it.
 */
import type { RoadmapSeedItem } from "./roadmap-types";

export const ROADMAP_SEED: RoadmapSeedItem[] = [
  // ─── Fait (déjà livré en Phase 0) ───────────────────────────────────────
  {
    title: "Recherche hybride (0-E)",
    description: "pgvector + tsvector fusionnés par RRF. Réutilisé par l'agent et le dashboard.",
    status: "done",
    theme: "Infra",
    sourceRef: "0-E",
    position: 0,
  },
  {
    title: "Distillation Q/R + embeddings (0-D)",
    description: "Extraction LLM des paires Q/R par thread, embeddings multilingues.",
    status: "done",
    theme: "KB",
    sourceRef: "0-D",
    position: 1,
  },
  {
    title: "Filtre AML conservateur (0-C)",
    description: "Exclusion CTIF/déclarations de soupçon avant tout stockage.",
    status: "done",
    theme: "KB",
    sourceRef: "0-C",
    position: 2,
  },
  {
    title: "Dashboard — onglet Base de connaissances (/faq)",
    description: "Table interactive + recherche sémantique + édition des fiches.",
    status: "done",
    theme: "Pilotage",
    position: 3,
  },

  // ─── En cours (M1) ──────────────────────────────────────────────────────
  {
    title: "Agent RAG + CLI (0-F)",
    description:
      "Copilot interne : réponses citées (ID/auteur/date) + alertes fraîcheur + divergences.",
    status: "in_progress",
    theme: "KB",
    sourceRef: "1.1",
    position: 0,
  },

  // ─── Prévu (M1 + M2) ────────────────────────────────────────────────────
  {
    title: "Dashboard sur vraie data",
    description: "Brancher les 44 courtiers + plan 13 étapes sur la DB (remplacer les mocks).",
    status: "planned",
    theme: "Pilotage",
    sourceRef: "1.2",
    position: 0,
  },
  {
    title: "Ingestion du Diagnostic (Fillout)",
    description: "Récupérer les réponses du diagnostic → table structurée. Pré-requis du rapport auto.",
    status: "planned",
    theme: "Pilotage",
    sourceRef: "1.3",
    position: 1,
  },
  {
    title: "Générateur Rapport de conformité + Plan d'action",
    description: "Brouillon LLM depuis le diagnostic, corrigé par l'officer avant le call de validation.",
    status: "planned",
    theme: "Docs",
    sourceRef: "2.1",
    position: 2,
  },
  {
    title: "Générateur de documents AML",
    description:
      "Templating des 5 livrables (Politique LBC/FT, EGR, rapports) rempli depuis le questionnaire FSMA.",
    status: "planned",
    theme: "Docs",
    sourceRef: "2.2",
    position: 3,
  },

  // ─── Idées (M3 + benchmark) ─────────────────────────────────────────────
  {
    title: "Auto-pull BCE / UBO sur génération AML",
    description:
      "Benchmark : le moat local d'AML Company. Remplit identité bureau / n°BCE / UBO automatiquement.",
    status: "idea",
    theme: "Docs",
    sourceRef: "2.2",
    position: 0,
  },
  {
    title: "AI file-checking (revue de dossiers)",
    description:
      "Benchmark : Aveni/Recordsure/Fintel. 100% des dossiers passés à l'IA, on ne remonte que les écarts.",
    status: "idea",
    theme: "KB",
    position: 1,
  },
  {
    title: "Export PDF inspection-ready FSMA",
    description: "Statut conformité d'un courtier prêt pour un contrôle. Table-stakes BE/FR + argument commercial.",
    status: "idea",
    theme: "Pilotage",
    sourceRef: "3.1",
    position: 2,
  },
  {
    title: "Fraîcheur prospective (nouveautés réglementaires)",
    description: "Benchmark Aptus.AI/RegEd : remonter aussi les NOUVEAUTÉS FSMA/IDD/AML, pas que le périmé.",
    status: "idea",
    theme: "KB",
    sourceRef: "3.2",
    position: 3,
  },
  {
    title: "Métriques delivery",
    description: "Temps gagné/courtier, couverture du plan, taux de réutilisation KB. Nourrit le pricing.",
    status: "idea",
    theme: "Pilotage",
    sourceRef: "3.3",
    position: 4,
  },
  {
    title: "DB de test séparée (TEST_DATABASE_URL)",
    description: "Dette : les tests d'intégration wipent la dev DB. À isoler avant montée en charge.",
    status: "idea",
    theme: "Infra",
    sourceRef: "3.4",
    position: 5,
  },
  {
    title: "Pricing SMB transparent",
    description: "Benchmark : prix quasi jamais affichés (seul Lya ~€35/mo). Un prix clair = différenciateur.",
    status: "idea",
    theme: "GTM",
    position: 6,
  },
];
