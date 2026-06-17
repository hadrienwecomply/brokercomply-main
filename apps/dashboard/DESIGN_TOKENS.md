# Design Tokens — BrokerComply dashboard

> Extracted from the live product page (Webflow): https://www.we-comply.be/solutions/brokercomply
> CSS bundle: `wecomply-2-0.webflow.shared.*.min.css`. The dashboard UI must stay coherent with this brand.

## Brand summary

- **Primary brand color = mint/emerald green `#5fbf99`** (NOT blue). Secondary accent = **purple `#7e86dc`**.
- Light, white-background, minimalist corporate SaaS. Generous rounded corners.
- Headings/display font = **Bricolage Grotesque**; body/UI font = **Inter** (both variable fonts, Google Fonts).
- Tone (FR): reassuring, "compliance as a commercial asset, not a constraint", responsive ("24h").

## Color palette (computed hexes from the Webflow `color-mix` swatches)

### Brand (green) — `--swatch--brand-*`
| Token | Hex |
|-------|-----|
| brand-50  | `#eff9f5` |
| brand-100 | `#dff2eb` |
| brand-200 | `#bfe5d6` |
| brand-300 | `#9fd9c2` |
| brand-400 | `#7fccad` |
| **brand-500** | **`#5fbf99`** (base) |
| brand-600 | `#4c997a` (button hover) |
| brand-700 | `#39735c` |
| brand-800 | `#264c3d` |
| brand-900 | `#13261f` |

### Purple (secondary accent) — `--swatch--purple-*`
| Token | Hex |
|-------|-----|
| purple-50  | `#f2f3fc` |
| purple-100 | `#e5e7f8` |
| purple-500 | `#7e86dc` (base) |
| purple-600 | `#656bb0` (hover) |

### Neutrals
| Token | Hex | Use |
|-------|-----|-----|
| light-100 | `#ffffff` | background / on-brand text |
| light-200 | `#ebebeb` | borders, dividers, subtle bg |
| dark-800 | `#2f2b2d` | secondary text |
| dark-900 | `#1f1d1e` | primary text / "brand-text" |

### Suggested status colors (dashboard-specific, harmonized with brand)
| Status (key → FR label) | Hex | Note |
|-------------------------|-----|------|
| `not_started` Pas commencé | `#ebebeb` / text `#2f2b2d` | neutral gray |
| `in_progress` En cours | `#7e86dc` (purple-500) | uses brand secondary |
| `waiting_client` En attente client | `#f0ad4e` (amber) | new, neutral amber |
| `blocked` Bloqué | `#ea384c` (red, from CSS `#ea384c`) | matches site error red |
| `done` Terminé | `#5fbf99` (brand-500) | brand green = success |
| `not_applicable` Non applicable | `#c8c8c8` | muted |

## Typography
- `--font-primary` (body/UI): **Inter** variable — weights 400/500/600/700.
- `--font-secondary` (display/headings): **Bricolage Grotesque** variable.
- Fluid type scale (clamp) from the site — approx rem targets:
  display ~4→7rem · h1 2.75→5 · h2 2.25→3.5 · h3 1.75→2.5 · h4 1.5→2 · h5 1.125→1.25 · h6 1→1.125 · text-large 1.125→1.325 · text-main 1→1.125.

## Radii
| Token | Value |
|-------|-------|
| radius-main | `1rem` (cards) |
| radius-medium | `0.75rem` |
| radius-small | `0.5rem` (inputs, nav, badges) |
| radius-round | pill (`100vw`) — buttons/eyebrows |

## Components (mirror the site)
- **Primary button**: bg `brand-500`, text white, hover `brand-600`, pill radius.
- **Secondary button**: bg `purple-500`, text white, hover `purple-600`.
- **Eyebrow/label**: small pill, white bg, `brand-500` text.
- **Cards**: white bg, `radius-main` (1rem), subtle border `light-200` or soft shadow.

## Tailwind config snippet (to drop into the scaffolded app)
```js
// tailwind.config — theme.extend
colors: {
  brand: { 50:'#eff9f5',100:'#dff2eb',200:'#bfe5d6',300:'#9fd9c2',400:'#7fccad',500:'#5fbf99',600:'#4c997a',700:'#39735c',800:'#264c3d',900:'#13261f' },
  purple: { 50:'#f2f3fc',100:'#e5e7f8',500:'#7e86dc',600:'#656bb0' },
  ink: { DEFAULT:'#1f1d1e', soft:'#2f2b2d' },
  line: '#ebebeb',
  status: { todo:'#ebebeb', progress:'#7e86dc', waiting:'#f0ad4e', blocked:'#ea384c', done:'#5fbf99', na:'#c8c8c8' },
},
borderRadius: { sm:'0.5rem', md:'0.75rem', lg:'1rem', pill:'100vw' },
fontFamily: { sans:['Inter','Arial','sans-serif'], display:['"Bricolage Grotesque"','Arial','sans-serif'] },
```

## Microcopy / tone reference
- Value props to echo: "Votre conformité de courtier gérée de A à Z" · "Libérez-vous de la complexité réglementaire" · "un atout commercial, pas une contrainte".
- Reassuring, action-oriented, French (vouvoiement on marketing, tutoiement in some client emails per Notion). CTAs short and warm ("Planifier un échange").
