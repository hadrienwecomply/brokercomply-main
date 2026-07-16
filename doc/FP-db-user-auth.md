# FP — Comptes utilisateurs en base (remplace les env vars Basic Auth)

- **Statut**: LIVE en prod (2026-07-16) — PR #3 → main `a751427`, migration 0015
  appliquée sur la DB Railway, gate actif (`/`→307 /login, /faq→401)
- **Branche**: `feat/db-user-auth` (mergée)
- **Date**: 2026-07-16
- **Reste**: créer les 3 comptes prod (`create-user.ts`), supprimer la variable
  morte `DASHBOARD_BASIC_AUTH_USERS` (services dashboard ET Postgres, via l'UI)

## Résumé

Le gate du dashboard (déployé publiquement sur Railway) reposait sur des
credentials en variables d'environnement (`DASHBOARD_BASIC_AUTH_USERS`).
Remplacé par un modèle `users` classique en Postgres :

- Table `users` (email unique, display_name, password_hash scrypt, is_active,
  last_login_at) — migration `0015_closed_jane_foster.sql`.
- Module partagé `@brokercomply/shared` → `src/auth/` : `hashPassword` /
  `verifyPassword` (scrypt PHC-style, node:crypto), `passwordFragment`,
  `authenticateUser`, `createUser`, `setUserPassword`.
- `/login` (server action) vérifie contre la DB ; cookie de session HMAC
  inchangé dans l'esprit mais la clé dérive **uniquement** de
  `DASHBOARD_SESSION_SECRET` (= interrupteur du gate ; absent en local → gate
  off). Le flux `Authorization: Basic` pour scripts/curl est **supprimé**.
- Le payload de session porte `phf` (empreinte du hash du mot de passe) :
  changer un mot de passe (ou désactiver un compte) rend périmées les sessions
  de CE user — vérifié par le layout (DB) → déconnexion auto (`StaleSessionSignout`).
  Le middleware Edge ne vérifie que HMAC + expiration (pas de DB à l'edge).
  Hard-kill global : faire tourner `DASHBOARD_SESSION_SECRET`.
- Bouton « Se déconnecter » : déjà présent dans la sidebar (inchangé).
- Script CLI : `pnpm -F @brokercomply/dashboard exec tsx scripts/create-user.ts
  <email> <nom>` (mot de passe demandé masqué ; re-run sur email existant =
  reset du mot de passe).

## Durcissements post-revue (code-reviewer + security-reviewer)

- **Révocation sur TOUTES les requêtes** : le middleware appelle la route
  interne `/api/auth/validate` (Node) qui vérifie `is_active`/`phf` en DB
  (cache 30 s in-process). Désactiver un compte / changer un mdp coupe donc
  aussi les routes API et server actions, pas seulement les pages.
- **Résilience DB** : la vérif DB fail-open sur erreur infra (le HMAC prouve
  déjà un login < 30 j) — un blip Postgres ne rend plus l'app inutilisable.
- **Rate-limit login** : 5 échecs par (IP, email) → verrou 15 min (in-memory,
  `src/lib/login-throttle.ts`).
- **`safeNextPath`** : rejette aussi chars de contrôle + backslash (bypass
  `/\t/evil.example`).
- **Service partagé** : min 10 caractères + email valide (pas de `|`, qui
  casserait le payload de session) imposés dans `createUser`/`setUserPassword`.
- **En-têtes sécurité** (next.config) : X-Frame-Options DENY, nosniff,
  Referrer-Policy, HSTS. (CSP volontairement remise à plus tard.)

## Vérification

- 28 tests unitaires (scrypt, session HMAC, service auth avec db stubbée) verts.
- e2e navigateur (puppeteer + Chrome) : redirect logged-out, erreur mauvais mdp,
  login → sidebar « Sacha / Connecté·e », cookie httpOnly, logout, gate
  re-appliqué, session périmée après changement de mdp → auto-signout. 13/13.
- Vérifs curl : en-têtes sécurité présents ; désactivation d'un compte →
  401 sur les routes API en ≤ 30 s ; 6ᵉ tentative de login → « Trop de
  tentatives ».

## Déploiement prod (TODO)

1. `railway` : ajouter `DASHBOARD_SESSION_SECRET` (long aléatoire), retirer
   `DASHBOARD_BASIC_AUTH_USERS` / `DASHBOARD_SESSION_SECRET` legacy si présent.
2. Appliquer la migration (`pnpm db:migrate` avec `DATABASE_URL` prod).
3. Créer les 3 comptes avec le script (DATABASE_URL prod).
4. ⚠️ Si un monitoring/script utilisait le header Basic, il ne marche plus.

## Note migrations

La branche prospects (worktree `prospects-crm`) avait généré un `0015` local —
convenu : elle renumérote en `0016` au merge (cf. MEMORY).
