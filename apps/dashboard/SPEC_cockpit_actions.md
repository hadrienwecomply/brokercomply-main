# Spec — Page « Prochaines Actions » = Poste de pilotage (`/actions`)

> Issu d'une session grill-me (2026-06-17). Données mockées (la page reste sur `mock-data.ts`).

## Intention
**Job n°1 = triage du jour** : répondre en 2 s à « par quoi je commence ? ». L'urgent (retard + aujourd'hui) domine visuellement ; le reste est secondaire.

## Modèle de données affiché
- **Unité** = 1 carte par courtier (sa prochaine action actionnable, `nextAction`), **dépliable** pour voir les autres sous-étapes de l'étape courante.
- Buckets dérivés de `daysUntil(deadline)` : En retard (<0), Aujourd'hui (=0), Cette semaine (1–7), Plus tard (>7).
- « En attente client » = courtiers dont l'étape courante est `waiting_client` (rien à faire, à relancer).

## Périmètre & navigation
- Ouverture par défaut sur **un officer (Sacha)**, sélecteur **Sacha / Gregory / Tous** bien visible.
- **Cross-filtrage** : cliquer un KPI ou une barre du graphe filtre instantanément la zone de travail.

## Agencement
1. **Rangée 1** : carte **« Focus maintenant »** (2/3, gauche) = l'action la plus urgente, en grand, bouton « Ouvrir le courtier » + « Modèle e-mail » si dispo. **KPIs (1/3, droite)** empilés : **Cette semaine · En retard · Aujourd'hui · En attente client** (cliquables → filtre).
2. **Rangée 2** : **graphe Recharts** pleine largeur = charge/jour sur 7 j + bucket « Retard » à gauche ; barres **colorées par urgence** ; clic = filtre.
3. **Zone de travail** : **2 onglets**
   - **① Cartes par urgence** : sections En retard + Aujourd'hui (ouvertes) · Cette semaine (compact, ouvert) · Plus tard (replié).
   - **② Kanban par urgence** : colonnes En retard / Aujourd'hui / Cette semaine / Plus tard, mini-cartes.
4. **Section « À relancer »** (en attente client) séparée et **repliée**, avec bouton **Relancer** (modal e-mail de rappel).

## Carte d'action (lisible)
- **Action en grand** (texte dominant) + contexte « courtier · étape (code+titre) » + avatar responsable + **échéance colorée** (rouge si retard).
- Actions rapides : **checkbox Fait** (coché → retire de la liste, local non persisté), **Ouvrir le courtier**, **Modèle e-mail** (modal `<dialog>` existant) si l'étape en a un.
- Dépliable : autres sous-étapes de l'étape courante.

## Tri
Par **échéance croissante** ; à égalité, **bloqué** en tête.

## Détails
- État vide : sections « Rien ici » (pas d'écran spécial).
- Graphe : couleur barre = urgence (retard rouge `#ea384c`, ≤2 j ambre, sinon brand vert).
- Typo agrandie (racine 17px), badges de statut, tabular-nums, icônes Lucide, cibles ≥44px (cohérent page Entreprise).

## Composants
`ActionsCockpit` (client, état: officer + filtre actif + onglet) · `FocusCard` · `KpiCard` (cliquable) · `WeekDeadlinesChart` (Recharts) · `ActionCard` (checkbox + quick actions + dépliable) · `RelanceSection`. Remplace `actions-list.tsx`.

## Dépendance
**Recharts** (à ajouter ; vérifier compat React 19 / Next 15, wrap `"use client"`). Fallback : bar-chart SVG maison si incompatibilité.
