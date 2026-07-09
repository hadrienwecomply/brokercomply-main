#!/usr/bin/env python3
"""
Assemble le payload final (findings) de façon DÉTERMINISTE, en rédaction juridique.

Entrées :
  - CONSTATS des subagents (verdicts + preuves par check),
  - matrice « gravée dans la roche » (recommandations.json) : structure, et pour
    chaque sous-section `constatLead` + `checks{id:{label,constatClause}}` +
    `combinaisons` (recos rédigées).

Sorties par sous-section :
  - NIVEAU : par décompte des sous-points remplis (aucun LLM).
  - CONSTAT : « <constatLead> que <clause> et que <clause>. » (clauses des checks non conformes).
  - RECOMMANDATION : combinaison exacte des checks non conformes (texte juridique pré-rédigé).
  - Les checks « à vérifier » ajoutent une réserve de vérification, sans affirmer de manquement.

Structure figée : toutes les sections/sous-sections de la matrice sont rendues.

Usage : python assemble_reco.py constats.json recommandations.json [--out payload.json]
"""
import argparse, json, sys

VALID = {"conforme", "non_conforme", "sans_objet", "a_verifier"}
VOY = "aeiouyéèêëâàîïôûh"


def que(c):
    return ("qu'" if c[:1].lower() in VOY else "que ") + c


def enum_que(items):
    out = ""
    for i, c in enumerate(items):
        p = que(c)
        out += (" " if i == 0 else (" et " if i == len(items) - 1 else ", ")) + p
    return out


def liste(labels):
    if len(labels) == 1:
        return labels[0]
    return ", ".join(labels[:-1]) + " et " + labels[-1]


def niveau(applic, filled, has_nc, has_av):
    n = len(applic)
    if n == 0:
        return "sans_objet"
    if filled == n:
        return "conforme"
    if not has_nc and has_av:
        return "a_verifier"
    if filled >= 2:
        return "amelioration"
    return "critique"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("constats")
    ap.add_argument("recommandations")
    ap.add_argument("--out", default="payload.genere.json")
    a = ap.parse_args()

    src = json.load(open(a.constats, encoding="utf-8"))
    matrix = json.load(open(a.recommandations, encoding="utf-8"))
    constats = src.get("constats", {})
    sections = matrix["sections"]
    ssm = matrix["sousSections"]

    findings = []
    counts = {"critique": 0, "amelioration": 0, "conforme": 0, "a_verifier": 0, "sans_objet": 0}

    for sec in sections:
        for pid in sec["sousSections"]:
            meta = ssm.get(pid, {})
            titre, legal = meta.get("titre", pid), meta.get("legalRefs", [])
            cmeta = meta.get("checks", {})
            lead = meta.get("constatLead", "Il est constaté")
            c = constats.get(pid)

            if c is None:
                findings.append({"id": pid, "section": sec["titre"], "title": titre,
                                 "level": "a_verifier", "score": {"filled": 0, "applicable": 0},
                                 "constat": "Cette sous-section n'a pas été analysée lors de la présente passe.",
                                 "recommandation": "Procéder à l'analyse de cette sous-section avant toute conclusion.",
                                 "legalRefs": legal, "checks": []})
                counts["a_verifier"] += 1
                continue
            if c.get("applicable") is False:
                findings.append({"id": pid, "section": sec["titre"], "title": titre,
                                 "level": "sans_objet", "score": {"filled": 0, "applicable": 0},
                                 "constat": "Cette sous-section est sans objet au regard du contenu du site.",
                                 "recommandation": "", "legalRefs": legal, "checks": c.get("checks", [])})
                counts["sans_objet"] += 1
                continue

            checks = c.get("checks", [])
            for ch in checks:
                if ch.get("verdict") not in VALID:
                    sys.exit(f"Verdict invalide {pid}/{ch.get('id')}: {ch.get('verdict')}")
            applic = [ch for ch in checks if ch.get("verdict") != "sans_objet"]
            filled = sum(1 for ch in applic if ch["verdict"] == "conforme")
            nc = [ch["id"] for ch in applic if ch["verdict"] == "non_conforme"]
            av = [ch["id"] for ch in applic if ch["verdict"] == "a_verifier"]
            lvl = niveau(applic, filled, bool(nc), bool(av))

            # CONSTAT (juridique)
            parts = []
            if nc:
                clauses = [cmeta.get(cid, {}).get("constatClause", cid) for cid in nc]
                parts.append(lead + enum_que(clauses) + ".")
            if av:
                labels = [cmeta.get(cid, {}).get("label", cid) for cid in av]
                parts.append("Sous réserve de vérification, " +
                             ("les éléments suivants n'ont pu être contrôlés : " if len(labels) > 1
                              else "l'élément suivant n'a pu être contrôlé : ") + liste(labels) + ".")
            if not parts:
                parts.append("Aucun manquement n'est relevé : les exigences applicables sont satisfaites.")
            constat = " ".join(parts)

            # RECOMMANDATION (combinaison exacte ; texte pré-rédigé)
            reco = ""
            if nc:
                cible = set(nc)
                hit = next((x for x in meta.get("combinaisons", []) if set(x["manquants"]) == cible), None)
                reco = hit["reco"] if hit else ""
            if av:
                labels = [cmeta.get(cid, {}).get("label", cid) for cid in av]
                if reco:
                    reco += " Les points suivants devront en outre faire l'objet d'une vérification : " + liste(labels) + "."
                else:
                    reco = "Une vérification est requise concernant : " + liste(labels) + "."

            findings.append({"id": pid, "section": sec["titre"], "title": titre, "level": lvl,
                             "score": {"filled": filled, "applicable": len(applic)},
                             "constat": constat, "recommandation": reco,
                             "legalRefs": legal, "checks": checks})
            counts[lvl] += 1

    payload = {"meta": src.get("meta", {}), "branding": src.get("branding", {}),
               "audit": src.get("audit", {}), "findings": findings,
               "summary": {"critiques": counts["critique"], "ameliorations": counts["amelioration"],
                           "conformes": counts["conforme"], "aVerifier": counts["a_verifier"]}}
    json.dump(payload, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("Payload écrit :", a.out)
    print("Décompte :", counts)


if __name__ == "__main__":
    main()
