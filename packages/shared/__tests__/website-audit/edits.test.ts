import { describe, expect, it } from "vitest";
import { applyAuditEdits } from "../../src/website-audit/edits.js";
import type { AuditPayload } from "../../src/website-audit/types.js";

const base: AuditPayload = {
  audit: {
    entity: { name: "Courtier SRL", fsmaStatus: "à confirmer" },
    site: { url: "https://x.be" },
    date: "2026-07-08",
    scope: "scope original",
    disclaimer: "disclaimer original",
  },
  findings: [
    { id: "P01", title: "Slogan", level: "critique", constat: "c1", recommandation: "r1" },
    { id: "P02", title: "FSMA", level: "amelioration", constat: "c2", recommandation: "r2" },
  ],
  summary: { critiques: 1, ameliorations: 1, conformes: 0, aVerifier: 0 },
};

describe("applyAuditEdits", () => {
  it("overrides constat/reco/level for named findings and recomputes summary", () => {
    const out = applyAuditEdits(base, {
      findings: {
        P01: { constat: "corrigé", level: "conforme" },
        P02: { recommandation: "reco revue" },
      },
    });
    expect(out.findings[0]).toMatchObject({ constat: "corrigé", level: "conforme", recommandation: "r1" });
    expect(out.findings[1]).toMatchObject({ constat: "c2", recommandation: "reco revue" });
    // P01 critique→conforme, P02 stays amelioration.
    expect(out.summary).toEqual({ critiques: 0, ameliorations: 1, conformes: 1, aVerifier: 0 });
  });

  it("applies header edits (scope/disclaimer/fsmaStatus)", () => {
    const out = applyAuditEdits(base, {
      header: { scope: "scope revu", disclaimer: "d revu", fsmaStatus: "courtier crédit + assurances" },
    });
    expect(out.audit.scope).toBe("scope revu");
    expect(out.audit.disclaimer).toBe("d revu");
    expect(out.audit.entity.fsmaStatus).toBe("courtier crédit + assurances");
  });

  it("ignores unknown finding ids and leaves the payload otherwise intact", () => {
    const out = applyAuditEdits(base, { findings: { P99: { constat: "ghost" } } });
    expect(out.findings).toHaveLength(2);
    expect(out.findings.map((f) => f.constat)).toEqual(["c1", "c2"]);
  });

  it("treats null/empty edits as a no-op (but recomputes summary)", () => {
    expect(applyAuditEdits(base, null).findings).toEqual(base.findings);
    expect(applyAuditEdits(base, {}).summary).toEqual(base.summary);
  });

  it("rejects a malformed level via schema validation", () => {
    expect(() => applyAuditEdits(base, { findings: { P01: { level: "nope" } } })).toThrow();
  });
});
