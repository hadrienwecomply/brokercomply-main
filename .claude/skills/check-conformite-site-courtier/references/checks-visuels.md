# Checks visuels — mesure du DOM rendu

Ces checks dépendent du **rendu** de la page, pas de son texte. On les mesure via
Claude in Chrome (`mcp__Claude_in_Chrome__javascript_tool`). Le résultat est figé dans
`<page>.visuel.json`, lu ensuite par le subagent du point concerné.

## Principe : localiser par le noyau invariant, pas par la formulation

Point crucial : on ne localise **jamais** le slogan en cherchant la phrase légale
exacte — c'est précisément ce qu'on veut vérifier. Si le slogan est fautif (« …a un
coût »), une recherche de la phrase correcte ne le trouverait pas, et on ne pourrait
ni citer le mauvais texte ni mesurer sa taille.

On localise donc par un **noyau invariant** présent dans toutes les variantes
(correcte comme fautive) : « emprunter de l'argent ». On récupère ensuite le **texte
réel** de l'élément trouvé. Ce texte réel sert à deux checks distincts :

- **P01.1 (formulation)** — comparer le texte réel à la phrase légale exacte
  « Attention, emprunter de l'argent coûte aussi de l'argent ». S'il diffère →
  Non-conforme, en citant le texte réellement affiché.
- **P01.3 (taille)** — mesurer la `font-size` du même élément et la comparer aux
  accroches.

La recherche se fait en cascade (du plus précis au plus large) et renvoie le niveau de
confiance, pour distinguer « slogan correct trouvé », « slogan fautif trouvé » et
« aucun slogan ».

## Procédure (par page promouvant un crédit)

1. `mcp__Claude_in_Chrome__navigate` vers l'URL de la page.
2. **Appel 1 — défilement** (le footer est souvent chargé dynamiquement) :
   ```js
   window.scrollTo(0, document.body.scrollHeight); 'scrolled ' + document.body.scrollHeight;
   ```
3. **Appel 2 — mesure** (l'eval ne supporte pas `await` ; on mesure dans un appel
   séparé, ce qui laisse au footer le temps de se charger). Colle le snippet ci-dessous.
4. Enregistre la sortie JSON dans `<page>.visuel.json`.

## Snippet de mesure (Appel 2)

```js
// Normaliser les espaces : les sites insèrent souvent des espaces insécables
// ( , &nbsp;) ou multiples. \s les couvre déjà ; on l'explicite par sûreté.
const norm = s => (s||'').replace(/[\s ]+/g,' ').trim();
function ownText(e){return norm([...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(''));}
function measure(e){ if(!e) return null; const cs=getComputedStyle(e); const r=e.getBoundingClientRect();
  return {tag:e.tagName, cls:String(e.className).slice(0,40), texteReel:norm(e.textContent).slice(0,120),
    fontSizePx:parseFloat(cs.fontSize), fontWeight:cs.fontWeight, color:cs.color,
    yTop:Math.round(r.top+window.scrollY), visibleSansScroll:(r.top>=0 && r.top<window.innerHeight),
    display:cs.display, visibility:cs.visibility}; }

// Parcours profond : descend aussi dans les shadow roots (footers/CMP en web components)
function allElements(root=document){ const out=[]; const walk=(n)=>{ for(const e of n.querySelectorAll('*')){ out.push(e); if(e.shadowRoot) walk(e.shadowRoot); } }; walk(root); return out; }
const ALL = allElements();
// Élément-feuille : porte directement le texte (pas un conteneur parent)
function findLeaf(re){ let best=null; for(const e of ALL){ if(re.test(ownText(e))){ if(!best || best.contains(e)) best=e; } } return best; }

// Localisation EN CASCADE par noyau invariant (jamais par la phrase exacte)
const RE_EXACT = /emprunter de l['’]argent co[uû]te aussi de l['’]argent/i; // version légale
const RE_NOYAU = /emprunter de l['’]argent/i;                              // noyau invariant (capte les variantes)
const RE_LARGE = /(emprunter|cr[ée]dit)[^.]{0,40}co[uû]t/i;                // filet large ("a un coût", etc.)
let slogan=null, confiance=null;
if((slogan=findLeaf(RE_EXACT)))      confiance='exact';   // formulation a priori correcte
else if((slogan=findLeaf(RE_NOYAU))) confiance='noyau';   // slogan présent, formulation à comparer
else if((slogan=findLeaf(RE_LARGE))) confiance='large';   // candidat probable, à vérifier
const PHRASE_LEGALE = "Attention, emprunter de l'argent coûte aussi de l'argent";
const formulationExacte = slogan ? (norm(slogan.textContent).toLowerCase() === norm(PHRASE_LEGALE).toLowerCase()) : null;

// Accroches commerciales : H1 + premiers H2/H3 ; CTA ; bannière cookies
const accroches=[...document.querySelectorAll('h1,h2,h3')].slice(0,6).map(measure);
const accrocheMaxPx = accroches.length ? Math.max(...accroches.map(a=>a.fontSizePx)) : null;
const cta=[...document.querySelectorAll('a,button')].filter(e=>/demande de cr[ée]dit|simulateur|appelez/i.test(e.textContent)).slice(0,3).map(measure);
const banner=ALL.find(e=>/accepter les cookies|param[ée]trer ou refuser/i.test(ownText(e)));

JSON.stringify({
  url: location.href,
  largeurFenetre: window.innerWidth,        // contexte responsive : la taille dépend de cette largeur
  hauteurFenetre: window.innerHeight,
  pageHeight: document.body.scrollHeight,
  sloganTrouve: !!slogan,
  confiance,                                // 'exact' | 'noyau' | 'large' | null
  slogan: measure(slogan),                  // contient texteReel + fontSizePx + yTop + visibleSansScroll
  formulationExacte,                        // true/false : texteReel == phrase légale ?
  accrocheMaxPx,
  accroches,
  banniereCookies: !!banner
}, null, 2);
```

## Interprétation

- **P01.1 (formulation)** — lire `formulationExacte`. `false` → Non-conforme : citer
  `slogan.texteReel` (le texte réellement affiché, ex. « …a un coût »). `true` →
  Conforme. (Ce check peut aussi se faire sur le scrape texte, mais le `texteReel`
  mesuré ici est la preuve la plus fiable.)
- **P01.3 (taille)** — comparer `slogan.fontSizePx` à `accrocheMaxPx`, **à la même
  `largeurFenetre`** (la taille est responsive). Conforme si le slogan est au moins
  aussi grand ; sinon Non-conforme. Citer les deux valeurs (ex. « slogan 35px vs
  accroche max 45,36px à 1512px de large »).
- **P01.2 (visibilité / emplacement)** — `slogan.visibleSansScroll` et `slogan.yTop`
  (comparé à `pageHeight`) indiquent si le slogan est haut dans la page ou relégué en
  pied (visible seulement après défilement complet).
- **`confiance`** — `'exact'` : slogan correct localisé. `'noyau'`/`'large'` : un
  slogan est présent mais sa formulation diffère (vérifier `formulationExacte` et
  citer `texteReel`). `null` + `sloganTrouve=false` : voir ci-dessous.
- **`sloganTrouve=false`** — causes par ordre de fréquence : (1) le slogan est vraiment
  absent (Non-conforme : aucun avertissement de coût) ; (2) footer non encore chargé →
  re-scroller ; (3) slogan rendu en **image** ou dans un **iframe** (le snippet
  traverse le shadow DOM, pas les iframes) → « À vérifier » en précisant la cause.
  `accrocheMaxPx` reste exploitable dans tous les cas.
- **P19.1 (bannière cookies)** — `banniereCookies` confirme la présence d'une CMP.

Mesure de référence recommandée : largeur **1280px** (desktop). Pour le comportement
mobile, répéter à 390px et comparer.
