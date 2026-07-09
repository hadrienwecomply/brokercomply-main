# Catalogue des points d'analyse et sous-points

Chaque **point** ci-dessous est destiné à un subagent dédié. Une obligation se
décompose en **sous-points** : des exigences élémentaires, vérifiables une par une.
Le subagent ne produit que des **constats** : pour chaque sous-point, un verdict + une
**citation littérale** de la page (preuve) + une justification + l'article. Il
n'écrit ni niveau de gravité ni recommandation. Voir le prompt standard dans `SKILL.md`.

Le **niveau** est ensuite calculé par décompte (ci-dessous) et la **recommandation**
provient de la matrice gravée dans la roche `assets/recommandations.json` (fragments par
check + combinaisons exactes). La **structure du rapport** (sections → sous-sections, et
leur ordre) est elle aussi définie dans cette matrice : elle est rendue à l'identique à
chaque audit. Le script `scripts/assemble_reco.py` réalise cet assemblage de façon
déterministe.

## Règle de criticité (décompte des sous-points)

Les sous-points sont formulés **positivement** : « rempli » (verdict Conforme) = la
bonne pratique est respectée. La gravité du point se déduit du nombre de sous-points
**applicables** remplis :

- point non applicable (champ d'application non réuni) → **Sans objet** ;
- tous les sous-points applicables remplis → **Conforme** (pas de constat) ;
- au moins 2 remplis, mais pas tous → **Amélioration recommandée** ;
- 0 ou 1 rempli → **Non-conformité critique**.

Le **champ d'application** (ex-« déclencheur ») n'est pas un sous-point : il sert
seulement à décider si le point s'applique. Un sous-point « Sans objet » est exclu du
décompte. Un « À vérifier » compte comme non rempli (signaler l'incertitude).

> **À arbitrer (Hadrien).** Avec cette règle stricte : (1) un point à **un seul**
> sous-point applicable (P03, P07, P21) est soit Conforme, soit critique — jamais
> « amélioration » ; (2) un point à **deux** sous-points ne peut pas être
> « amélioration » non plus (2/2 = Conforme, sinon critique). Conséquence notable :
> une zone grise comme la rapidité (P08) devient critique dès qu'une seule formulation
> pèche. Si tu veux nuancer certains points mineurs (CCP, rapidité…), on peut leur
> ajouter des sous-points ou leur fixer un plafond de gravité. Dis-moi.

Détails d'articles, seuils et hypothèses : `cadre-legal.md`. Procédure des sous-points
**[VISUEL]** : `checks-visuels.md`.

---

## P01 — Slogan légal crédit
- **Champ d'application :** pages promouvant un crédit (+ footer).
- **Base légale :** art. VII.64 §2 CDE.
- **Sous-points :**
  - P01.1 — La formulation exacte « Attention, emprunter de l'argent coûte aussi de l'argent » figure au mot près (toute variante comme « a un coût » n'est pas remplie). Localiser par le noyau « emprunter de l'argent » puis comparer le texte réel (voir `checks-visuels.md`).
  - P01.2 **[VISUEL]** — Le slogan est visible rapidement (zone de contenu, près de la première offre de crédit), pas relégué au seul pied de page (`slogan.visibleSansScroll`, `slogan.yTop`).
  - P01.3 **[VISUEL]** — Sa taille est au moins égale à celle de l'accroche commerciale la plus grande, **à la même largeur d'écran** (`slogan.fontSizePx` ≥ `accrocheMaxPx`).
  - P01.4 — Le slogan est présent sur chaque page promouvant un crédit (pas seulement l'accueil).

## P02 — Registre FSMA et lien de vérification (identification)
- **Base légale :** art. VII.128 §1 2° CDE ; art. XII.6 §1 CDE.
- **Sous-points :**
  - P02.1 — La/les qualité(s) d'intermédiaire (crédit hypothécaire, crédit conso, assurances selon le cas) sont indiquées (footer ou mentions).
  - P02.2 — Le numéro d'inscription FSMA est indiqué (au-delà du seul BCE).
  - P02.3 — Un lien de vérification vers le data portal FSMA (fsma.be) est présent.

## P03 — Cohérence statut FSMA / activité promue
- **Champ d'application :** le site présente activement du crédit à la consommation (montants, durées, TAEG, comparaison d'offres, simulateur conso). Sinon → Sans objet.
- **Base légale :** art. I.9 35° CDE ; art. VII.161 §1 CDE.
- **Sous-points :**
  - P03.1 — La catégorie crédit à la consommation figure dans le statut FSMA de l'entité (à défaut, le positionnement reste apporteur d'affaires pur, sans présentation active). Si le statut FSMA est inconnu → À vérifier.
- **Note :** en cas de manquement, présenter les deux options dans le constat : (A) s'inscrire en crédit conso (CABRIO), (B) revoir les pages pour supprimer toute présentation active.

## P04 — Publicité incitative au regroupement de crédits
- **Base légale :** art. VII.65 §1 3° CDE ; art. VII.123 §2 3° CDE.
- **Sous-points (remplis = absence d'incitation) :**
  - P04.1 — Absence de vignette ou de section mettant en avant le regroupement de crédits.
  - P04.2 — Absence de call-to-action incitatif (« regroupez vos crédits », « facilitez-vous la vie », bouton dédié).
  - P04.3 — Absence de liste d'avantages ou de FAQ incitative (« réduire vos mensualités », « gestion simplifiée »…).
  - P04.4 — Le regroupement ne figure pas dans les services mis en avant (menu, footer).
- **Note :** une description strictement neutre et factuelle du mécanisme (sans mise en avant) remplit ces sous-points.

## P05 — Voies de réclamation et organismes de médiation
- **Base légale :** art. VII.128 §1 4° CDE.
- **Sous-points :**
  - P05.1 — Une procédure de réclamation interne est communiquée.
  - P05.2 — OMBUDSFIN (médiation crédit) est mentionné.
  - P05.3 — L'Ombudsman des Assurances est mentionné. Sans objet si pas d'activité assurances.

## P06 — Exemple représentatif TAEG
- **Champ d'application :** la page affiche un chiffre lié au coût/montant/durée/taux d'un crédit (y compris résultat de simulateur). Sinon → Sans objet.
- **Base légale :** art. VII.64 §1 CDE ; art. VII.124 §1 et §2 CDE.
- **Sous-points :**
  - P06.1 — Un exemple représentatif complet (type, montant, durée, TAEG, taux débiteur, mensualité, montant total) figure sur la même page. Hypothèses : hypothécaire 170 000 €/20 ans/taux fixe ; conso 1 500 €/12 mois.
  - P06.2 — Un exemple distinct existe pour chaque type de crédit proposé. Sans objet si un seul type sur la page.

## P07 — Prospectus crédit hypothécaire
- **Champ d'application :** le site exerce en crédit hypothécaire.
- **Base légale :** art. VII.125 CDE.
- **Sous-points :**
  - P07.1 — Un prospectus gratuit et permanent (types de crédits, sûretés, durées, types de taux, exemple TAEG, frais et indemnités, indices de référence, conséquences du non-paiement) est accessible.

## P08 — Rapidité / facilité d'obtention
- **Champ d'application :** pages de produit crédit.
- **Base légale :** art. VII.65 §1 2° CDE ; art. VII.123 §2 2° CDE.
- **Sous-points (remplis = absence de publicité sur la rapidité) :**
  - P08.1 — Absence de formulation chiffrée de rapidité d'octroi (« argent en 24 h », « décision dans l'heure »).
  - P08.2 — Absence de mise en avant générale de la rapidité/facilité (le discours porte sur la qualité de l'analyse du dossier, pas sur la vitesse).

## P09 — Vente groupée / libre choix de l'assureur
- **Champ d'application :** une assurance est liée/associée au crédit.
- **Base légale :** art. VII.147 §1 CDE (mod. 1er juin 2024).
- **Sous-points :**
  - P09.1 — Le libre choix de l'assureur est mentionné.
  - P09.2 — Le droit de changer d'assureur après un tiers de la durée du crédit, sans perdre la réduction de taux, est mentionné.

## P10 — Qualité d'intermédiaire en assurances + FSMA assurances
- **Champ d'application :** le site propose/négocie des assurances (SRD, etc.).
- **Base légale :** loi 4 avril 2014, art. 261/262/281.
- **Sous-points :**
  - P10.1 — La qualité de courtier en assurances est mentionnée (page assurance ET footer).
  - P10.2 — Le numéro d'inscription FSMA assurances + un lien de vérification figurent.

## P11 — Caractère non obligatoire de l'assurance SRD
- **Champ d'application :** le site propose une assurance SRD.
- **Base légale :** art. VI.97 CDE.
- **Sous-points :**
  - P11.1 — Le caractère non légalement obligatoire est indiqué dans le corps du texte (pas seulement en FAQ).
  - P11.2 — Le produit n'est pas présenté comme « essentiel / incontournable » sans nuance.

## P12 — Droit à l'oubli
- **Champ d'application :** la page évoque le questionnaire médical, les pathologies ou maladies chroniques.
- **Base légale :** loi 4 avril 2019 ; AR 26 mai 2019 (mod. 2023).
- **Sous-points :**
  - P12.1 — Le droit à l'oubli est mentionné.
  - P12.2 — Le délai applicable (ramené à 5 ans depuis le 1er janvier 2025 pour la plupart des cancers) est précisé.

## P13 — Investissement : distinction consommateur / professionnel
- **Champ d'application :** pages d'investissement immobilier, ou mention « professionnels ».
- **Base légale :** art. VII.3 §2 2° CDE.
- **Sous-points :**
  - P13.1 — Le public visé (consommateur particulier vs professionnel) est précisé.
  - P13.2 — Le régime applicable est adapté au public visé (ou, pour un public mixte, le régime le plus protecteur — Livre VII — est retenu).

## P14 — Investissement : risque de requalification fiscale
- **Champ d'application :** la page emploie des formulations de rentabilité (« cash-flow », « optimiser la rentabilité », « stratégies de revente », « actif générateur de revenus »).
- **Base légale :** CIR 92 art. 90 1° ; art. VI.97 CDE.
- **Sous-points :**
  - P14.1 — Un avertissement sur le risque de requalification fiscale (imposition au taux progressif) est présent.
  - P14.2 — Une invitation à consulter un conseiller fiscal avant tout projet est présente.

## P15 — Crédit in fine / bullet : communication des risques
- **Champ d'application :** un crédit in fine / bullet est présenté.
- **Base légale :** art. VI.97 CDE.
- **Sous-points :**
  - P15.1 — Les risques spécifiques (capital à rembourser en totalité à l'échéance, échec de la stratégie de sortie, saisie, risque de taux/dépréciation) sont communiqués.
  - P15.2 — La nécessité de définir une stratégie de sortie avant souscription est mentionnée.

## P16 — Crédit sans apport : contraintes prudentielles BNB
- **Champ d'application :** le crédit sans apport ou des quotités élevées (100 %, 125 %) sont présentés.
- **Base légale :** Circulaire NBB_2019_27 ; art. VI.97 CDE.
- **Sous-points :**
  - P16.1 — Les contraintes prudentielles BNB (quotités de référence ~90 % primo / ~80 % autres) sont mentionnées.
  - P16.2 — Le caractère exceptionnel et conditionné de ces financements est précisé.

## P17 — Demande de crédit : nature de la démarche
- **Champ d'application :** page « demande de crédit » comportant un formulaire.
- **Base légale :** art. VII.126 §2 CDE ; art. VI.97 CDE.
- **Sous-points :**
  - P17.1 — Le formulaire comporte les éléments de l'art. VII.126 §2 (but du crédit, revenus, personnes à charge, engagements en cours).
  - P17.2 — À défaut, l'intitulé et la présentation reflètent une simple prise de contact (et non une demande de crédit formelle, ce qui serait trompeur).
  - Si le contenu du formulaire n'est pas lisible (rendu dynamique) → À vérifier.

## P18 — Mentions légales conformes
- **Base légale :** art. VII.128 §1 CDE ; art. XII.6 §1 CDE.
- **Sous-points :**
  - P18.1 — Les mentions identifient l'entité auditée (et non l'agence web comme propriétaire/exploitant).
  - P18.2 — L'inscription FSMA et les qualités d'intermédiaire y figurent.
  - P18.3 — Les coordonnées du SPF Économie, les voies de médiation et une référence à la CCP y figurent.

## P19 — Cookies : consentement préalable et politique
- **Base légale :** loi 13 juin 2005 art. 129 §1 ; Recommandation APD n° 01/2020 ; RGPD art. 7.
- **Sous-points :**
  - P19.1 **[VISUEL]** — Une bannière de consentement (CMP) est présente, avec un refus aussi simple que l'acceptation (`banniereCookies`).
  - P19.2 — Aucun cookie non essentiel (Google Analytics `_ga`/`_gid`/`_gat`, Adwords) n'est déposé avant le consentement opt-in.
  - P19.3 — La politique cookies est complète et accessible via un lien fonctionnel (chaque cookie : finalité, durée, base légale).

## P20 — RGPD formulaires : lien vers la politique de confidentialité
- **Champ d'application :** un formulaire collecte des données personnelles.
- **Base légale :** RGPD art. 7 et 13.
- **Sous-points :**
  - P20.1 — La case de consentement contient un lien cliquable vers la politique de confidentialité, accessible avant soumission.

## P21 — Centrale des Crédits aux Particuliers (CCP)
- **Base légale :** art. VII.69 CDE.
- **Sous-points :**
  - P21.1 — Une information sur la CCP (avec renvoi vers la BNB) figure sur le site (mentions légales / politique de confidentialité).

## P22 — Simulateur : avertissement de non-contractualité
- **Champ d'application :** un simulateur affiche des résultats chiffrés.
- **Base légale :** bonne pratique ; art. VI.97 CDE.
- **Sous-points :**
  - P22.1 — Un avertissement indique que la simulation est fournie à titre indicatif et ne constitue pas une offre de crédit.
  - P22.2 — Il est précisé que l'octroi reste sous réserve d'acceptation du dossier par le prêteur.

## P23 — Articles de blog et pages géolocalisées
- **Champ d'application :** présence d'articles de blog ou de pages géolocalisées.
- **Base légale :** art. VI.97 CDE ; art. VII.64/VII.124 CDE.
- **Sous-points :**
  - P23.1 — Ces contenus ont pu être analysés (sinon À vérifier — point de vigilance).
  - P23.2 — L'information est équilibrée (risques présentés au même titre que les avantages).
  - P23.3 — Aucune publicité chiffrée déguisée (slogan + exemple représentatif présents dès que des chiffres apparaissent) ni incitation au regroupement.
