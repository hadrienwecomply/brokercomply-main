# Règle — Squelette commun des rapports BrokerComply

> **À lire avant de créer ou modifier un rapport** (audit site web, diagnostic
> Fillout, ou tout nouveau rapport PDF/HTML). Objectif : un seul design system,
> une seule stratégie de mise en page, une marque unique.

## 1. Ce qui est partagé vs propre à chaque rapport

**Partagé** (le squelette) : le modèle de page, le padding, l'échelle typo, les
tokens neutres + sévérité, et la mise en forme des composants. → [`report-base.css`](./report-base.css).

**Propre à chaque rapport** : la **marque** = couleur (`--primary`/`--accent`) +
logo. Elle est **injectée**, jamais codée en dur dans `report-base.css` :

| Rapport | Logo | Couleur | Fallback |
|---------|------|---------|----------|
| **Audit site web** | logo du **courtier** | couleur extraite du courtier | maison BrokerComply (navy `#1B2A4A` / vert `#3DDC84` / logo vert) |
| **Diagnostic Fillout** | maison BrokerComply | charte lavande (`#4f3f93` / `#a99bdb`) | — |

L'audit site web est **white-label** : logo + couleur du courtier, désormais
stockés dans BrokerComply sur la fiche (`brokers.logo_base64` /
`brokers.primary_color`, couleur extraite du logo par vision — voir la mémoire
`broker-logo-branding-feature`). Le pipeline les injecte :

- in-app : `brandingFor(broker)` (website-audit.server.ts) → `render-html.ts`.
- PDF : le payload porte `branding.{logoUrl,primaryColor,firmName}`, et
  `build-reco-html.js` fait `--primary:${branding.primaryColor || '#1B2A4A'}`,
  `logoUrl = branding.logoUrl || DEFAULT_LOGO`.

Le nom du courtier apparaît comme **entité auditée** (`audit.entity.name`).
Les surfaces teintées utilisent `--tint` (gris neutre) pour rester lisibles
quelle que soit la couleur de marque du courtier.

## 2. Mise en page : **jamais de contenu plein-bord**

Deux stratégies selon la longueur du contenu :

### (A) Fixed-page — contenu à longueur maîtrisée
_(ex. diagnostic Fillout `build-review.js`, base statique `stroh-review-full.html`)_

- Chaque `.page` = 1 feuille A4, **padding interne** `--page-pad` (18mm).
- `@page{ margin:0 }` **+ marges Gotenberg = 0** : le blanc vient du `.page`,
  pas des marges d'impression (« évite la bande blanche »).

### (B) Flowing — contenu à longueur variable
_(ex. audit site web `build-reco-html.js` : N findings imprévisibles)_

- Le contenu **coule**, Chromium pagine tout seul.
- Les marges (= le padding visuel) viennent des **paramètres physiques de
  Gotenberg** : `marginTop/Bottom/Left/Right` **non nuls**.
- `@page{ size:A4 }` **obligatoire** pour que `preferCssPageSize:true` choisisse
  A4 (sinon Gotenberg imprime en **Letter**).
- ⚠️ **Piège** : les marges CDP passées à Gotenberg **écrasent** tout
  `@page{ margin }` CSS. En flowing, on **doit** passer les marges à Gotenberg —
  les mettre à `0` en espérant du padding CSS produit un rapport **plein-bord**
  (c'était le bug « pas de padding » de l'audit site web).

### Réglage Gotenberg de référence (modèle flowing)

Nœud Gotenberg du workflow n8n (`/forms/chromium/convert/html`), unités en
**pouces** :

| Param | Valeur | ≈ |
|-------|--------|---|
| `preferCssPageSize` | `true` | — |
| `printBackground` | `true` | — |
| `marginTop` | `0.63` | 16 mm |
| `marginBottom` | `0.79` | 20 mm (place le footer natif) |
| `marginLeft` | `0.71` | 18 mm |
| `marginRight` | `0.71` | 18 mm |

Le pied de page natif Gotenberg (binaire `footer.html`) se loge dans la
**marge basse** — d'où `marginBottom` ≥ 20 mm.

## 3. Composants partagés

Fournis par `report-base.css`, réutilisés tels quels :
`.cover` (garde), `.sec-h` (titre de section), `.kpi(s)` (synthèse chiffrée),
`.finding` (carte de constat, bord gauche par sévérité), `.badge` / `.vd`
(pastilles de sévérité/verdict), `table.meta` (méta de garde), `table.chk`
(annexe des contrôles), `.reco` / `.suggest` / `.ref-chip`.

## 4. Squelette HTML minimal

```html
<!doctype html><html lang="fr-BE"><head>
<meta charset="utf-8"><title>… — {entité}</title>
<style>/* contenu intégral de report-base.css + styles propres au rapport */</style>
</head><body>
  <!-- flowing : sections qui coulent, séparées par .break -->
  <section class="cover break">…</section>
  <section class="synth break">…</section>
  <section class="break">… findings …</section>
</body></html>
```

## 5. Où vit quoi

| Fichier | Rôle |
|---------|------|
| `.rules/report-base.css` | **Source de vérité** de la structure partagée |
| `.rules/report-skeleton.md` | Cette spec |
| `apps/dashboard/src/lib/website-audit.server.ts` | `brandingFor(broker)` → marque du courtier |
| `packages/shared/src/website-audit/render-html.ts` | Rendu éditable in-app (audit) |
| `apps/dashboard/src/lib/review-html.ts` | Injection cfg du rendu éditable |
| `n8n-automations/workflows/build-reco-html.js` | Builder PDF audit (flowing) |
| `n8n-automations/workflows/build-review.js` | Builder PDF diagnostic (fixed-page) |
| `n8n-automations/workflows/audit-site-web-pdf.json` | Workflow n8n (marges Gotenberg) |

> Les builders n8n **embarquent** `report-base.css` en ligne (pas d'import à
> l'exécution). Toute évolution visuelle : modifier `report-base.css` d'abord,
> puis reporter dans les builders et re-importer le workflow dans n8n.

## 6. Checklist « nouveau rapport »

- [ ] Marque injectée via `--primary`/`--accent` + logo (courtier pour l'audit,
      maison pour le diagnostic) — jamais codée en dur dans `report-base.css`.
- [ ] Surfaces teintées via `--tint` (neutre), pas via une couleur de marque.
- [ ] Choisir fixed-page **ou** flowing selon la longueur du contenu.
- [ ] Flowing → `@page{ size:A4 }` présent **et** marges Gotenberg non nulles.
- [ ] Fixed-page → `@page{ margin:0 }` + padding `.page`.
- [ ] Réutiliser les composants de `report-base.css` (pas de CSS ad hoc divergente).
- [ ] Vérifier en régénérant un PDF réel (padding sur **toutes** les pages, pas
      seulement la garde).
