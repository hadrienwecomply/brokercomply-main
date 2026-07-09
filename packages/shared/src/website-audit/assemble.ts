import type { CheckResult, Constats, Finding, Level, AuditPayload, RecoMatrix } from './types.js';

/**
 * Deterministic assembler — TypeScript port of the skill's
 * `scripts/assemble_reco.py`. Given the checkers' constats (verdicts +
 * evidence) and the hand-edited matrix, it computes the level (by counting)
 * and the recommendation (exact combination lookup). No LLM involved: the
 * same constats always produce byte-identical findings. A parity test pins
 * this port against the Python script's output.
 */

const VALID = new Set(['conforme', 'non_conforme', 'sans_objet', 'a_verifier']);
const VOY = 'aeiouyéèêëâàîïôûh';

function que(c: string): string {
  const first = c.slice(0, 1).toLowerCase();
  return (first && VOY.includes(first) ? "qu'" : 'que ') + c;
}

function enumQue(items: string[]): string {
  let out = '';
  items.forEach((c, i) => {
    const p = que(c);
    out += (i === 0 ? ' ' : i === items.length - 1 ? ' et ' : ', ') + p;
  });
  return out;
}

function liste(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  return labels.slice(0, -1).join(', ') + ' et ' + labels[labels.length - 1]!;
}

function niveau(applicCount: number, filled: number, hasNc: boolean, hasAv: boolean): Level {
  if (applicCount === 0) return 'sans_objet';
  if (filled === applicCount) return 'conforme';
  if (!hasNc && hasAv) return 'a_verifier';
  if (filled >= 2) return 'amelioration';
  return 'critique';
}

export function assemblePayload(src: Constats, matrix: RecoMatrix): AuditPayload {
  const constats = src.constats ?? {};
  const findings: Finding[] = [];
  const counts: Record<Level, number> = {
    critique: 0,
    amelioration: 0,
    conforme: 0,
    a_verifier: 0,
    sans_objet: 0,
  };

  for (const sec of matrix.sections) {
    for (const pid of sec.sousSections) {
      const meta = matrix.sousSections[pid] ?? {};
      const titre = meta.titre ?? pid;
      const legal = meta.legalRefs ?? [];
      const cmeta = meta.checks ?? {};
      const lead = meta.constatLead ?? 'Il est constaté';
      const c = constats[pid];

      if (c === undefined) {
        findings.push({
          id: pid,
          section: sec.titre,
          title: titre,
          level: 'a_verifier',
          score: { filled: 0, applicable: 0 },
          constat: "Cette sous-section n'a pas été analysée lors de la présente passe.",
          recommandation: "Procéder à l'analyse de cette sous-section avant toute conclusion.",
          legalRefs: legal,
          checks: [],
        });
        counts.a_verifier += 1;
        continue;
      }
      if (c.applicable === false) {
        findings.push({
          id: pid,
          section: sec.titre,
          title: titre,
          level: 'sans_objet',
          score: { filled: 0, applicable: 0 },
          constat: 'Cette sous-section est sans objet au regard du contenu du site.',
          recommandation: '',
          legalRefs: legal,
          checks: c.checks ?? [],
        });
        counts.sans_objet += 1;
        continue;
      }

      const checks: CheckResult[] = c.checks ?? [];
      for (const ch of checks) {
        if (!VALID.has(ch.verdict)) {
          throw new Error(`Verdict invalide ${pid}/${ch.id}: ${String(ch.verdict)}`);
        }
      }
      const applic = checks.filter((ch) => ch.verdict !== 'sans_objet');
      const filled = applic.filter((ch) => ch.verdict === 'conforme').length;
      const nc = applic.filter((ch) => ch.verdict === 'non_conforme').map((ch) => ch.id);
      const av = applic.filter((ch) => ch.verdict === 'a_verifier').map((ch) => ch.id);
      const lvl = niveau(applic.length, filled, nc.length > 0, av.length > 0);

      // Constat (legal prose, assembled from the matrix clauses)
      const parts: string[] = [];
      if (nc.length > 0) {
        const clauses = nc.map((cid) => cmeta[cid]?.constatClause ?? cid);
        parts.push(lead + enumQue(clauses) + '.');
      }
      if (av.length > 0) {
        const labels = av.map((cid) => cmeta[cid]?.label ?? cid);
        parts.push(
          'Sous réserve de vérification, ' +
            (labels.length > 1
              ? "les éléments suivants n'ont pu être contrôlés : "
              : "l'élément suivant n'a pu être contrôlé : ") +
            liste(labels) +
            '.',
        );
      }
      if (parts.length === 0) {
        parts.push("Aucun manquement n'est relevé : les exigences applicables sont satisfaites.");
      }
      const constat = parts.join(' ');

      // Recommendation: exact combination lookup (pre-written legal text)
      let reco = '';
      if (nc.length > 0) {
        const cible = new Set(nc);
        const hit = (meta.combinaisons ?? []).find(
          (x) => x.manquants.length === cible.size && x.manquants.every((m) => cible.has(m)),
        );
        reco = hit?.reco ?? '';
      }
      if (av.length > 0) {
        const labels = av.map((cid) => cmeta[cid]?.label ?? cid);
        if (reco) {
          reco += " Les points suivants devront en outre faire l'objet d'une vérification : " + liste(labels) + '.';
        } else {
          reco = 'Une vérification est requise concernant : ' + liste(labels) + '.';
        }
      }

      findings.push({
        id: pid,
        section: sec.titre,
        title: titre,
        level: lvl,
        score: { filled, applicable: applic.length },
        constat,
        recommandation: reco,
        legalRefs: legal,
        checks,
      });
      counts[lvl] += 1;
    }
  }

  return {
    meta: (src.meta ?? {}) as AuditPayload['meta'],
    branding: (src.branding ?? {}) as AuditPayload['branding'],
    audit: src.audit ?? { entity: { name: '' }, site: { url: '' }, date: '' },
    findings,
    summary: {
      critiques: counts.critique,
      ameliorations: counts.amelioration,
      conformes: counts.conforme,
      aVerifier: counts.a_verifier,
    },
  };
}
