# Feature Plan — Roadmap Kanban éditable & collaborative

**Statut :** done · **Démarré :** 2026-06-22 · **Terminé :** 2026-06-22
**App :** `apps/dashboard` (Next 15 App Router, React 19, Tailwind, `@brokercomply/shared`)

## Résumé
Page `/roadmap` : tableau **Kanban** (Idées · Prévu · En cours · Fait) pré-rempli depuis `ROADMAP_Phase1.md`, où l'équipe interne ajoute des idées, édite/déplace des cartes et vote. Audience : interne uniquement (pas d'auth, cookie officer existant). Partage = URL réseau privé.

## Décisions
- **Audience :** équipe interne → aucune auth ajoutée (cookie `bc_officer`).
- **Format :** Kanban, 4 colonnes par statut + votes.
- **Source initiale :** chantiers de la roadmap dev Phase 1.
- **Drag-drop :** **HTML5 natif** (zéro dépendance, compat React 19) plutôt que `@dnd-kit`.

## Impacts (fichiers)
- `packages/shared/src/db/schema.ts` : tables `roadmap_items`, `roadmap_votes` (+ migration).
- `apps/dashboard/src/lib/` : `roadmap-types.ts`, `roadmap-board.ts` (pur), `roadmap-template.ts`, `roadmap.server.ts`, `roadmap-actions.ts`.
- `apps/dashboard/app/roadmap/page.tsx` ; `apps/dashboard/scripts/seed-roadmap.ts`.
- `apps/dashboard/src/components/` : `roadmap-board.tsx`, `roadmap-card.tsx`, `roadmap-editor.tsx`.
- `apps/dashboard/src/components/app-shell.tsx` : entrée de nav.

## Phases
1. Data layer (schema + migration). ← en cours
2. Seed depuis ROADMAP_Phase1.
3. Service server-only + route + board lecture.
4. Édition : add idée, drawer édition, drag-drop natif, votes, archive.
5. Finition (filtre thème, copier-lien, vue imprimable), tests purs, `next build`.

## Critères de succès
- `/roadmap` affiche les 4 colonnes pré-remplies depuis la Phase 1.
- Un officer ajoute une idée, l'édite, la déplace entre colonnes, vote — persisté en DB.
- `next build` + `tsc` verts ; tests purs (board grouping, template) verts.

## Journal d'exécution
- 2026-06-22 : plan validé (« go »). Démarrage Phase 1.
- 2026-06-22 : P1 migration `0003` (roadmap_items, roadmap_votes) appliquée. P2 seed 16 cartes. P3+P4 service shared `roadmap/service.ts` + wrapper `roadmap.server.ts` + actions + board `/roadmap` (drag-drop natif, votes, add/edit/archive, filtre thème). P5 10 tests purs verts, `tsc -b` vert, `next build` vert, smoke test `/roadmap` → 200 avec cartes. **Terminé.**
